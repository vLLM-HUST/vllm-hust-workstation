import copy
import json
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch

scripts = Path(__file__).parents[1]
sys.path.insert(0, str(scripts))
try:
    import mod_compatibility as compatibility
    import mod_launch_inventory as launch
finally:
    sys.path.remove(str(scripts))


class LaunchInventoryTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix="mod-launch-test-")
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)

    def process(self, pid=12, args=None):
        directory = self.root / str(pid)
        directory.mkdir()
        fields = ["S", *("0" for _ in range(18)), "1234", "0"]
        (directory / "stat").write_text(f"{pid} (name with ) spaces) " + " ".join(fields))
        (directory / "cmdline").write_bytes("\0".join(args or ["/serving/bin/python", "/serving/bin/vllm", "serve", "/private/model", "--tensor-parallel-size", "4", "--api-key", "private-secret"]).encode() + b"\0")
        return directory

    def test_projected_options_do_not_leak_paths_secrets_or_assume_defaults(self):
        self.process()
        data = launch.collect_launch(self.root)
        self.assertTrue(data["available"])
        self.assertEqual(data["options"], {"tensorParallel": 4})
        self.assertNotIn("private", json.dumps(data))
        self.assertEqual(data["startTicks"], 1234)

    def test_multiple_or_missing_servers_are_unknown(self):
        self.assertFalse(launch.collect_launch(self.root)["available"])
        self.process(12); self.process(13)
        self.assertFalse(launch.collect_launch(self.root)["available"])

    def test_reused_process_or_exit_during_scan_is_unknown(self):
        self.process()
        for readings in [[1234, 1235], [1234, 1234, OSError()]]:
            with patch.object(launch, "process_start", side_effect=readings):
                self.assertFalse(launch.collect_launch(self.root)["available"])

    def test_shell_mentions_and_non_serving_process_are_not_servers(self):
        self.process(args=["bash", "-c", "vllm serve model"])
        self.assertFalse(launch.collect_launch(self.root)["available"])

    def test_aliases_and_explicit_booleans(self):
        self.assertEqual(launch.parse_options(["-tp", "4", "-pp=2", "--max-num-seqs=8", "--no-enable-prefix-caching", "--async-scheduling", "--dtype", "bfloat16"]),
                         {"tensorParallel": 4, "pipelineParallel": 2, "maxNumSeqs": 8, "prefixCaching": False, "asyncScheduling": True, "dtype": "bfloat16"})

    def test_conflicting_repeated_or_malformed_flags_are_not_guessed(self):
        for args, key in [(["--tensor-parallel-size", "4", "-tp", "1"], "tensorParallel"),
                          (["--async-scheduling", "--no-async-scheduling"], "asyncScheduling"),
                          (["--max-num-seqs=-2"], "maxNumSeqs"), (["--enforce-eager=false"], "enforceEager"),
                          (["--dtype=private-secret"], "dtype")]:
            self.assertIsNone(launch.parse_options(args)[key])

    def test_speculative_options_are_filtered(self):
        options = launch.parse_options(["--speculative-config", json.dumps({"method": "eagle3", "model": "/private/draft", "token": "secret", "enforce_eager": True})])
        self.assertEqual(options, {"speculativeConfig": {"method": "eagle3", "enforce_eager": True}})


class CompatibilityTests(unittest.TestCase):
    def setUp(self):
        self.snapshot = {"artifactIdentityVerified": True, "container": {"id": "a" * 64},
                         "launch": {"available": True, "evidenceLevel": "process-command-line", "pid": 12, "startTicks": 1234,
                                    "options": {"tensorParallel": 4, "maxNumSeqs": 8, "asyncScheduling": True, "prefixCaching": False, "dtype": "bfloat16"}}}

    def assess(self, source=None, validator=None):
        return compatibility.assess(self.snapshot, "diffspec", source or compatibility.DIFFSPEC_SOURCE, validator or compatibility.DIFFSPEC_VALIDATOR)

    def test_current_style_launch_produces_specific_adaptation_requirements(self):
        report = self.assess()
        self.assertEqual(report["status"], "adaptation-required")
        self.assertEqual({c["id"] for c in report["checks"] if c["status"] == "adaptation-required"}, {"tensorParallel", "maxNumSeqs", "asyncScheduling"})
        self.assertFalse(report["ready"])
        self.assertFalse(report["runtimeQualified"])

    def test_missing_flags_are_unknown_not_invented_runtime_defaults(self):
        checks = {c["id"]: c for c in self.assess()["checks"]}
        for key in ["pipelineParallel", "enforceEager", "quantization"]:
            self.assertEqual(checks[key]["status"], "unknown")

    def test_matching_explicit_constraints_still_do_not_qualify_model_or_runtime(self):
        self.snapshot["launch"]["options"] = {"tensorParallel": 1, "pipelineParallel": 1, "maxNumSeqs": 1, "asyncScheduling": False,
                                               "enforceEager": True, "prefixCaching": False, "dtype": "bfloat16"}
        report = self.assess()
        self.assertEqual(report["status"], "unverified")
        self.assertFalse(report["ready"])
        self.assertIn("model-and-draft", [c["id"] for c in report["checks"] if c["status"] == "unknown"])

    def test_other_source_or_validator_cannot_reuse_historical_constraints(self):
        for kwargs in [{"source": "b" * 40}, {"validator": "c" * 64}]:
            report = self.assess(**kwargs)
            self.assertEqual(report["status"], "unverified")
            self.assertEqual(report["checks"][0]["id"], "source")

    def test_unverified_image_or_ambiguous_process_cannot_produce_admission(self):
        self.snapshot["artifactIdentityVerified"] = False
        self.assertEqual(self.assess()["checks"][0]["id"], "artifact")
        self.snapshot["artifactIdentityVerified"] = True
        self.snapshot["launch"]["available"] = False
        self.assertEqual(self.assess()["checks"][0]["id"], "launch")

    def test_assessment_does_not_modify_input_or_launch_configuration(self):
        before = copy.deepcopy(self.snapshot)
        self.assess()
        self.assertEqual(self.snapshot, before)


if __name__ == "__main__":
    unittest.main()
