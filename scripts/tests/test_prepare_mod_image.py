import hashlib
import importlib.util
import json
from pathlib import Path
import sys
import tempfile
import unittest
import zipfile
from unittest.mock import patch
import io

scripts = str(Path(__file__).parents[1])
sys.path.insert(0, scripts)
try:
    spec = importlib.util.spec_from_file_location("prepare_mod_image", Path(scripts) / "prepare_mod_image.py")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
finally:
    sys.path.remove(scripts)


class ImagePreparationTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix="mod-image-test-")
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.library = self.root / "library"
        self.output = self.root / "prepared"
        self.output.mkdir(mode=0o700)
        wheels = self.library / "diffspec/wheels"
        wheels.mkdir(parents=True)
        hashes = {}
        self.packages = {}
        for name in ["vllm-diffspec", "vllm-hust-ext"]:
            filename = name.replace("-", "_") + "-0.2.0-py3-none-any.whl"
            file = wheels / filename
            with zipfile.ZipFile(file, "w") as wheel:
                wheel.writestr(name.replace("-", "_") + "-0.2.0.dist-info/METADATA", f"Name: {name}\nVersion: 0.2.0\n")
                if name == "vllm-diffspec":
                    wheel.writestr("diffspec/proposer.py", b"# fake proposer\n")
            digest = hashlib.sha256(file.read_bytes()).hexdigest()
            hashes[filename] = digest
            self.packages[name] = {"version": "0.2.0", "wheelSha256": digest}
        self.receipt = {"installed": True, "sha": "a" * 40, "managerSha": "b" * 40, "manifest": {"bundle_id": "org.vllm-hust.diffspec"}, "wheels": hashes}
        self.save_receipt()
        self.base = "sha256:" + "c" * 64
        self.candidate = "sha256:" + "d" * 64
        self.baseline = {"vllm": {"version": "0.28.1rc1", "wheelSha256": "1" * 64}, "vllm-ascend": {"version": "0.25.1rc1", "wheelSha256": "2" * 64}}
        self.dependencies = {"packaging": {"version": "26.3", "wheelSha256": None}, "platformdirs": {"version": "4.3.6", "wheelSha256": None}}
        self.calls = []
        self.failure = None

    def save_receipt(self):
        (self.library / "diffspec/receipt.json").write_text(json.dumps(self.receipt))

    def execute(self, argv):
        self.calls.append(argv)
        if "build" in argv:
            if self.failure == "build":
                raise ValueError("simulated build failure")
            context = Path(argv[-1])
            self.assertIn("--network=none", argv)
            self.assertNotIn(".env", [p.name for p in context.iterdir()])
            self.assertIn("--no-deps", (context / "Dockerfile").read_text())
            witness = context / "wheels/workstation_mod_runtime-0.1.1-py3-none-any.whl"
            self.packages["workstation-mod-runtime"] = {"version": "0.1.1", "wheelSha256": hashlib.sha256(witness.read_bytes()).hexdigest()}
            return "built"
        if argv[1:3] == ["image", "inspect"]:
            if argv[-1] == self.base:
                return json.dumps([{"Id": self.base, "RootFS": {"Layers": ["base-layer"]}}])
            return json.dumps([{"Id": self.candidate, "RootFS": {"Layers": ["foreign" if self.failure == "base" else "base-layer", "mod-layer"]}}])
        if "run" in argv:
            self.assertIn("--network=none", argv)
            self.assertIn("--read-only", argv)
            self.assertFalse(any(arg.startswith("--device") for arg in argv))
            self.assertNotIn("--privileged", argv)
            self.assertIn("--entrypoint=/runtime/bin/python", argv)
            if "validate" in argv:
                return json.dumps({"bundle_id": "org.vllm-hust.diffspec", "distribution": "vllm-diffspec", "distribution_version": "0.2.0", "host": {"version_range": ">=0.23,<0.24"}})
            if module.WITNESS_PROBE in argv:
                return json.dumps({"entrypoint": "workstation_mod_runtime", "defaultOff": self.failure != "observer", "artifact": {"modId": "diffspec", "sourceSha": "a" * 40, "wheelSha256": self.packages["vllm-diffspec"]["wheelSha256"], "version": "0.2.0", "componentFileSha256": hashlib.sha256(b"# fake proposer\n").hexdigest()}})
            if self.candidate in argv:
                packages = {**self.baseline, **self.dependencies, **self.packages}
                if packages["platformdirs"] is None:
                    packages["platformdirs"] = {"version": module.SUPPORT["version"], "wheelSha256": module.SUPPORT["sha256"]}
                if self.failure == "engine":
                    packages["vllm"] = {"version": "0.23.0", "wheelSha256": "3" * 64}
                if self.failure == "wheel":
                    packages["vllm-diffspec"] = {"version": "0.2.0", "wheelSha256": "4" * 64}
                return json.dumps(packages)
            return json.dumps({**self.baseline, **self.dependencies})
        self.fail("unexpected Docker action")

    def prepare(self):
        return module.prepare(self.library, self.output, "diffspec", "a" * 40, "b" * 40, self.base, ["docker"], self.execute, python_bin="/runtime/bin/python")

    def test_installs_into_same_image_python_without_runtime_mutations(self):
        result = self.prepare()
        self.assertEqual(result["status"], "prepared")
        self.assertEqual(result["imageId"], self.candidate)
        self.assertEqual(result["runtimePackages"], self.baseline)
        self.assertFalse(result["runtimeActivationVerified"])
        self.assertEqual(len(result["artifacts"]), 3)
        self.assertTrue(result["workerWitness"]["defaultOff"])
        self.assertEqual(json.loads(Path(result["receiptPath"]).read_text())["status"], "prepared")
        self.assertTrue(all(command[1] in {"image", "run", "build"} for command in self.calls))

    def test_tampered_wheel_never_reaches_docker(self):
        file = next((self.library / "diffspec/wheels").iterdir())
        file.write_bytes(b"tampered")
        with self.assertRaisesRegex(ValueError, "hash changed"):
            self.prepare()
        self.assertEqual(self.calls, [])

    def test_even_rehashed_wheel_cannot_overwrite_engine_files_or_console(self):
        for member, payload in [("vllm/__init__.py", "bad"), ("vllm_diffspec-0.2.0.dist-info/entry_points.txt", "[console_scripts]\nvllm = diffspec:main\n")]:
            with self.subTest(member=member):
                file = self.library / "diffspec/wheels/vllm_diffspec-0.2.0-py3-none-any.whl"
                with zipfile.ZipFile(file, "w") as wheel:
                    wheel.writestr("vllm_diffspec-0.2.0.dist-info/METADATA", "Name: vllm-diffspec\nVersion: 0.2.0\n")
                    wheel.writestr(member, payload)
                self.receipt["wheels"][file.name] = hashlib.sha256(file.read_bytes()).hexdigest()
                self.save_receipt()
                with self.assertRaises(ValueError):
                    self.prepare()
        self.assertEqual(self.calls, [])

    def test_source_or_manager_pin_mismatch_refused(self):
        for key in ["sha", "managerSha"]:
            old = self.receipt[key]
            self.receipt[key] = "f" * 40
            self.save_receipt()
            with self.assertRaisesRegex(ValueError, "source pins"):
                self.prepare()
            self.receipt[key] = old
        self.assertEqual(self.calls, [])

    def test_artifact_path_traversal_refused(self):
        self.receipt["wheels"] = {"../outside.whl": "1" * 64, "other.whl": "2" * 64}
        self.save_receipt()
        with self.assertRaisesRegex(ValueError, "name or digest"):
            self.prepare()
        self.assertEqual(self.calls, [])

    def test_symlink_artifact_refused(self):
        file = next((self.library / "diffspec/wheels").iterdir())
        saved = self.root / "original.whl"
        file.rename(saved)
        file.symlink_to(saved)
        with self.assertRaisesRegex(ValueError, "real library file"):
            self.prepare()

    def test_mutable_image_refused(self):
        self.base = "some/image:latest"
        with self.assertRaisesRegex(ValueError, "full local image ID"):
            self.prepare()
        self.assertEqual(self.calls, [])

    def test_engine_mutation_wrong_base_and_wrong_wheel_fail_closed(self):
        for failure in ["engine", "base", "wheel", "build", "observer"]:
            with self.subTest(failure=failure):
                self.failure = failure
                with self.assertRaises(ValueError):
                    self.prepare()
        receipts = list(self.output.glob("prepare-*/receipt.json"))
        self.assertEqual(len(receipts), 5)
        self.assertTrue(all(json.loads(file.read_text())["status"] == "failed" for file in receipts))

    def test_missing_base_artifact_provenance_refused_before_build(self):
        self.baseline["vllm"]["wheelSha256"] = None
        with self.assertRaisesRegex(ValueError, "immutable wheel metadata"):
            self.prepare()
        self.assertFalse(any("build" in command for command in self.calls))

    def test_dockerfile_does_not_activate_or_install_dependencies(self):
        source = module.dockerfile(self.base, "a" * 32, "/runtime/bin/python")
        self.assertIn("--no-index --no-deps", source)
        self.assertNotIn("VLLM_PLUGINS", source)
        self.assertIn('ENV VLLMHUST_EXT_ENABLED_BUNDLES=""', source)
        self.assertIn('ENV WORKSTATION_MOD_CONTEXT=""', source)
        self.assertNotIn("ENTRYPOINT", source)
        self.assertNotIn("CMD", source)
        with self.assertRaises(ValueError):
            module.dockerfile("image\nRUN reboot", "a" * 32, "/runtime/bin/python")

    def test_serving_interpreter_cannot_be_implicit_or_shell_code(self):
        for value in ["python3", "/bin/sh", "/bin/python;reboot", "/tmp/../bin/python"]:
            with self.assertRaisesRegex(ValueError, "Python path"):
                module.validate_python(value)

    def test_missing_manager_dependency_uses_fixed_hashed_support_wheel(self):
        self.dependencies["platformdirs"] = None
        payload = b"fake-support-wheel"
        with patch.dict(module.SUPPORT, {"sha256": hashlib.sha256(payload).hexdigest()}), patch.object(module.urllib.request, "urlopen", return_value=io.BytesIO(payload)):
            result = self.prepare()
        self.assertEqual(result["status"], "prepared")
        self.assertEqual(len(result["artifacts"]), 4)

    def test_corrupt_download_never_reaches_docker_build(self):
        self.dependencies["platformdirs"] = None
        with patch.object(module.urllib.request, "urlopen", return_value=io.BytesIO(b"corrupt")):
            with self.assertRaisesRegex(ValueError, "support wheel hash"):
                self.prepare()
        self.assertFalse(any("build" in command for command in self.calls))

    def test_existing_manager_dependency_is_preserved_or_rejected_not_downgraded(self):
        self.dependencies["platformdirs"]["version"] = "3.0.0"
        with self.assertRaisesRegex(ValueError, "requirements"):
            self.prepare()
        self.assertFalse(any("build" in command for command in self.calls))


if __name__ == "__main__":
    unittest.main()
