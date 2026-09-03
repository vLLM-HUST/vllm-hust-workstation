import copy
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest

spec = importlib.util.spec_from_file_location("mod_deployment", Path(__file__).parents[1] / "mod_deployment.py")
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)

BASE = {"imageId": "sha256:" + "a" * 64, "configurationHash": "b" * 64, "mods": []}
MOD = {"imageId": "sha256:" + "c" * 64, "configurationHash": "d" * 64, "mods": [{"id": "diffspec", "sourceSha": "e" * 40, "wheelSha256": "f" * 64}]}


class FakeAdapter:
    def __init__(self):
        self.revision = copy.deepcopy(BASE)
        self.identity = {"containerId": "1" * 64, "startedAt": "initial", "ownerGeneration": "initial"}
        self.now = 100
        self.calls = []
        self.owner = None
        self.ready = True
        self.fail = None
        self.restoring = False

    def inspect(self):
        return copy.deepcopy({"targetId": "test", "identity": self.identity, "revision": self.revision, "healthy": True, "activationVerified": True, "inferenceVerified": True, "observedAt": self.now})

    def preflight(self, candidate):
        return {"ready": self.ready, "reasons": [] if self.ready else ["missing contract"]}

    def activate(self, candidate, identifier, deadline):
        self.calls.append("activate")
        if self.fail == "before":
            raise RuntimeError("private credential must never be logged")
        self.owner = identifier
        self.revision = copy.deepcopy(candidate)
        self.identity = {"containerId": "2" * 64, "startedAt": "candidate", "ownerGeneration": identifier}
        if self.fail == "foreign":
            self.owner = "foreign-operator"
        if self.fail == "crash":
            raise SystemExit("simulate process death, not a recoverable Python error")
        if self.fail == "after":
            raise RuntimeError("activate failed after changing the target")

    def owns_transition(self, identifier):
        return self.owner == identifier

    def verify(self, revision, identifier, deadline):
        self.calls.append("verify")
        data = self.inspect()
        if not self.restoring and self.fail in {"proof", "rollback", "wrong-revision", "stale", "inference", "foreign"}:
            data["activationVerified"] = False
        if not self.restoring and self.fail == "inference":
            data["activationVerified"] = True
            data["inferenceVerified"] = False
        if not self.restoring and self.fail == "wrong-revision":
            data["activationVerified"] = True
            data["revision"] = copy.deepcopy(BASE)
        if not self.restoring and self.fail == "stale":
            data["observedAt"] = 0
        return data

    def restore(self, previous, identifier, deadline):
        self.calls.append("restore")
        if self.fail == "rollback":
            raise RuntimeError("rollback failed")
        self.restoring = True
        self.revision = copy.deepcopy(previous)
        self.identity = {"containerId": "3" * 64, "startedAt": "restored", "ownerGeneration": identifier}


class DeploymentTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix="mod-deployment-test-")
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.adapter = FakeAdapter()
        self.now = 100
        self.controller = module.DeploymentController(self.root, {"test": self.adapter}, clock=lambda: self.now)

    def plan(self, candidate=None, **kwargs):
        return self.controller.plan("test", copy.deepcopy(candidate or MOD), **kwargs)

    def apply(self, plan, **kwargs):
        return self.controller.apply("test", plan["id"], plan["approval"], plan["planHash"], restart_confirmed=True, **kwargs)

    def test_plan_has_no_runtime_side_effects_and_does_not_store_raw_approval(self):
        plan = self.plan()
        self.assertEqual(self.adapter.calls, [])
        raw = (self.root / "test" / (plan["id"] + ".json")).read_text()
        self.assertNotIn(plan["approval"], raw)
        self.assertEqual(json.loads(raw)["phase"], "awaiting_approval")

    def test_only_fully_verified_runtime_becomes_effective(self):
        result = self.apply(self.plan())
        self.assertEqual(result["phase"], "effective")
        self.assertEqual([item["phase"] for item in result["history"]], ["awaiting_approval", "applying", "verifying", "effective"])
        self.assertNotIn("approvalHash", result)

    def test_explicit_restart_confirmation_is_required(self):
        plan = self.plan()
        with self.assertRaisesRegex(module.DeploymentError, "confirmation"):
            self.controller.apply("test", plan["id"], plan["approval"], plan["planHash"])
        self.assertEqual(self.adapter.calls, [])

    def test_approval_cannot_be_replayed(self):
        plan = self.plan()
        self.apply(plan)
        with self.assertRaisesRegex(module.DeploymentError, "consumed"):
            self.apply(plan)
        self.assertEqual(self.adapter.calls.count("activate"), 1)

    def test_expired_approval_cannot_mutate(self):
        plan = self.plan()
        self.now += 601
        with self.assertRaisesRegex(module.DeploymentError, "expired"):
            self.apply(plan)
        self.assertEqual(self.adapter.calls, [])

    def test_approval_binds_plan_hash(self):
        plan = self.plan()
        for field in ["approval", "planHash"]:
            altered = {**plan, field: "invalid"}
            with self.assertRaises(module.DeploymentError):
                self.apply(altered)
        self.assertEqual(self.adapter.calls, [])

    def test_target_replacement_invalidates_approval(self):
        plan = self.plan()
        self.adapter.identity["containerId"] = "4" * 64
        with self.assertRaisesRegex(module.DeploymentError, "target changed"):
            self.apply(plan)
        self.assertEqual(self.adapter.calls, [])

    def test_rechecks_admission_at_execution(self):
        plan = self.plan()
        self.adapter.ready = False
        with self.assertRaisesRegex(module.DeploymentError, "admission changed"):
            self.apply(plan)
        self.assertEqual(self.adapter.calls, [])

    def test_failed_proof_inference_wrong_revision_or_stale_evidence_rolls_back(self):
        for failure in ["proof", "inference", "wrong-revision", "stale", "after"]:
            with self.subTest(failure=failure):
                self.adapter.fail = failure
                self.adapter.restoring = False
                result = self.apply(self.plan())
                self.assertEqual(result["phase"], "rolled_back")
                self.assertEqual(self.adapter.revision, BASE)

    def test_rollback_failure_is_not_success_and_blocks_following_operations(self):
        self.adapter.fail = "rollback"
        result = self.apply(self.plan())
        self.assertEqual(result["phase"], "rollback_failed")
        with self.assertRaisesRegex(module.DeploymentError, "recovery"):
            self.plan()

    def test_foreign_takeover_does_not_restart_or_restore_foreign_target(self):
        self.adapter.fail = "foreign"
        result = self.apply(self.plan())
        self.assertEqual(result["phase"], "rollback_failed")
        self.assertNotIn("restore", self.adapter.calls)

    def test_error_before_side_effects_does_not_restart_healthy_baseline(self):
        self.adapter.fail = "before"
        result = self.apply(self.plan())
        self.assertEqual(result["phase"], "failed")
        self.assertNotIn("restore", self.adapter.calls)
        self.assertNotIn("credential", json.dumps(result))

    def test_crash_journal_survives_controller_restart_and_only_explicitly_rolls_back(self):
        self.adapter.fail = "crash"
        plan = self.plan()
        with self.assertRaises(SystemExit):
            self.apply(plan)
        replacement = module.DeploymentController(self.root, {"test": self.adapter}, clock=lambda: self.now)
        with self.assertRaisesRegex(module.DeploymentError, "recovery"):
            replacement.plan("test", MOD)
        with self.assertRaisesRegex(module.DeploymentError, "confirmation"):
            replacement.recover("test", plan["id"])
        self.adapter.fail = None
        result = replacement.recover("test", plan["id"], rollback_confirmed=True)
        self.assertEqual(result["phase"], "rolled_back")
        self.assertEqual(self.adapter.calls.count("activate"), 1)

    def test_disable_is_a_revision_transition_not_package_removal(self):
        self.apply(self.plan())
        result = self.apply(self.plan(BASE, operation="disable"))
        self.assertEqual(result["phase"], "effective")
        self.assertEqual(result["observation"]["revision"]["mods"], [])

    def test_unknown_target_mutable_image_or_multi_mod_rejected(self):
        with self.assertRaisesRegex(module.DeploymentError, "not enrolled"):
            self.controller.plan("unknown", MOD)
        for bad in [{**MOD, "imageId": "latest"}, {**MOD, "mods": MOD["mods"] * 2}]:
            with self.assertRaises(module.DeploymentError):
                self.plan(bad)
        self.assertEqual(self.adapter.calls, [])

    def test_plan_tampering_is_rejected(self):
        plan = self.plan()
        file = self.root / "test" / (plan["id"] + ".json")
        record = json.loads(file.read_text())
        record["plan"]["candidate"] = BASE
        file.write_text(json.dumps(record))
        with self.assertRaisesRegex(module.DeploymentError, "changed after"):
            self.apply(plan)

    def test_target_lock_rejects_concurrent_operation(self):
        with self.controller.lock("test"):
            with self.assertRaisesRegex(module.DeploymentError, "executing"):
                self.plan()

    def test_degraded_baseline_after_approval_is_not_stopped(self):
        plan = self.plan()
        original = self.adapter.inspect
        self.adapter.inspect = lambda: {**original(), "healthy": False}
        with self.assertRaisesRegex(module.DeploymentError, "no longer verified"):
            self.apply(plan)
        self.assertEqual(self.adapter.calls, [])

    def test_snapshot_does_not_alias_caller_configuration(self):
        candidate = copy.deepcopy(MOD)
        plan = self.controller.plan("test", candidate)
        candidate["mods"][0]["id"] = "latchmoe"
        self.assertEqual(plan["plan"]["candidate"]["mods"][0]["id"], "diffspec")
        self.assertEqual(self.apply(plan)["phase"], "effective")

    def test_deadline_failure_does_not_become_effective(self):
        ticks = [0]
        self.controller.monotonic = lambda: ticks[0]
        original = self.adapter.activate

        def slow_activate(*args):
            original(*args)
            ticks[0] += 901

        self.adapter.activate = slow_activate
        self.assertEqual(self.apply(self.plan())["phase"], "rolled_back")

    def test_unchanged_process_identity_cannot_prove_restarted_deployment(self):
        original = self.adapter.activate
        identity = copy.deepcopy(self.adapter.identity)

        def no_restart(*args):
            original(*args)
            self.adapter.identity = identity

        self.adapter.activate = no_restart
        self.assertEqual(self.apply(self.plan())["phase"], "rolled_back")

    def test_unknown_observation_fields_are_not_exposed(self):
        original = self.adapter.inspect
        self.adapter.inspect = lambda: {**original(), "privateEnvironment": "secret"}
        with self.assertRaisesRegex(module.DeploymentError, "incomplete"):
            self.plan()

    def test_moving_journal_to_another_target_is_rejected(self):
        plan = self.plan()
        self.controller.adapters["other"] = self.adapter
        other = self.controller.target_dir("other")
        source = self.root / "test" / (plan["id"] + ".json")
        (other / source.name).write_bytes(source.read_bytes())
        with self.assertRaisesRegex(module.DeploymentError, "another target"):
            self.controller.apply("other", plan["id"], plan["approval"], plan["planHash"], restart_confirmed=True)
        self.assertEqual(self.adapter.calls, [])

    def test_stale_or_unverified_baseline_cannot_be_rollback_target(self):
        self.adapter.now = 0
        with self.assertRaisesRegex(module.DeploymentError, "stale"):
            self.plan()
        self.adapter.now = 100
        original = self.adapter.inspect
        self.adapter.inspect = lambda: {**original(), "inferenceVerified": False}
        with self.assertRaisesRegex(module.DeploymentError, "rollback baseline"):
            self.plan()

    def test_symlink_store_rejected(self):
        alias = self.root / "alias"
        alias.symlink_to(self.root, target_is_directory=True)
        with self.assertRaises(module.DeploymentError):
            module.DeploymentController(alias, {})


if __name__ == "__main__":
    unittest.main()
