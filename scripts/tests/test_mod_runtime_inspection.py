import importlib.util
import json
from pathlib import Path
import unittest

spec = importlib.util.spec_from_file_location("inspect_mod_runtime", Path(__file__).parents[1] / "inspect_mod_runtime.py")
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class InventoryTests(unittest.TestCase):
    def run_inventory(self, changed=False, running=True, lock="matched"):
        calls = []
        target = {"Id": "a" * 64, "Image": "sha256:" + "b" * 64, "State": {"StartedAt": "2026-09-03T00:00:00Z", "Running": running}}

        def run(argv, input_text=None):
            calls.append(argv)
            if "exec" in argv:
                self.assertEqual(argv[-3], "a" * 64)
                self.assertIn("importlib.metadata", input_text)
                self.assertNotIn("import torch", input_text)
                return json.dumps({"packages": {}, "surfaces": {}, "lockStatus": lock})
            if changed and len(calls) > 1:
                return json.dumps([{**target, "Id": "c" * 64}])
            return json.dumps([target])

        return module.inspect("workstation-example", ["docker"], run), calls

    def test_identity_bound_read_only_inventory_is_not_runtime_proof(self):
        result, calls = self.run_inventory()
        self.assertTrue(result["artifactIdentityVerified"])
        self.assertFalse(result["runtimeActivationVerified"])
        self.assertEqual(len(calls), 3)
        self.assertTrue(all(call[1] in {"inspect", "exec"} for call in calls))

    def test_concurrent_replacement_rejects_observation(self):
        with self.assertRaisesRegex(ValueError, "changed"):
            self.run_inventory(changed=True)

    def test_stopped_container_rejected(self):
        with self.assertRaisesRegex(ValueError, "not running"):
            self.run_inventory(running=False)

    def test_lock_mismatch_never_verified(self):
        for lock in ["mismatch", "unavailable", "invalid"]:
            result, _ = self.run_inventory(lock=lock)
            self.assertFalse(result["artifactIdentityVerified"])

    def test_name_cannot_supply_docker_flags_or_commands(self):
        for name in ["--privileged", "a;reboot", "../other", "", "a b"]:
            with self.assertRaises(ValueError):
                module.inspect(name, ["docker"], lambda *args: self.fail("must not execute"))

    def test_collector_compiles_without_importing_runtime(self):
        compile(module.COLLECTOR, "collector", "exec")


if __name__ == "__main__":
    unittest.main()
