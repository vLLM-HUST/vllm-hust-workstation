#!/usr/bin/env python3
"""Prepare a Mod in the serving image's Python, without changing a live service.

Input artifacts must match the reviewed library receipt. Network access and pip
dependency resolution are disabled. The resulting receipt proves installation,
not host compatibility, materialization, or successful inference.
"""
import argparse
import configparser
import email.parser
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import tempfile
import urllib.request
import uuid
import zipfile

from mod_deployment import atomic_write


PACKAGES = {"bidkv": "bidkv", "diffspec": "vllm-diffspec", "latchmoe": "vllm-moe-offload-ascend"}
MODULES = {"bidkv": "bidkv", "vllm-diffspec": "diffspec", "vllm-moe-offload-ascend": "vllm_moe_offload_ascend", "vllm-hust-ext": "vllm_hust_ext"}
SHA = r"[a-f0-9]{40}"
DIGEST = r"[a-f0-9]{64}"
SUPPORT = {
    "package": "platformdirs", "version": "4.3.6", "filename": "platformdirs-4.3.6-py3-none-any.whl",
    "url": "https://files.pythonhosted.org/packages/3c/a6/bc1012356d8ece4d66dd75c4b9fc6c1f6650ddd5991e421177d9f8f671be/platformdirs-4.3.6-py3-none-any.whl",
    "sha256": "73e575e1408ab8103900836b97580d5307456908a03e92031bab39e4554cc3fb",
}
PROBE = '''
import importlib.metadata as m
import json
import sys
result = {}
for name in sys.argv[1:]:
    try:
        dist = m.distribution(name)
    except m.PackageNotFoundError:
        result[name] = None
        continue
    direct = json.loads(dist.read_text("direct_url.json") or "{}")
    result[name] = {"version": dist.version, "wheelSha256": direct.get("archive_info", {}).get("hashes", {}).get("sha256")}
print(json.dumps(result))
'''


def canonical(name):
    return re.sub(r"[-_.]+", "-", name).lower()


def download_support(destination):
    with urllib.request.urlopen(SUPPORT["url"], timeout=30) as response:
        payload = response.read(1_000_001)
    if len(payload) > 1_000_000 or hashlib.sha256(payload).hexdigest() != SUPPORT["sha256"]:
        raise ValueError("Manager support wheel hash mismatch")
    destination.write_bytes(payload)


def check_manager_dependency(package, metadata, minimum_major):
    version = metadata.get("version", "") if isinstance(metadata, dict) else ""
    match = re.fullmatch(r"(\d+)\.\d+(?:\.\d+)?", version)
    if not match or int(match[1]) < minimum_major:
        raise ValueError("base " + package + " does not meet reviewed Manager requirements")


def run(argv):
    result = subprocess.run(argv, text=True, capture_output=True, timeout=600,
                            env={"PATH": "/usr/local/bin:/usr/bin:/bin", "LANG": "C.UTF-8"})
    if result.returncode:
        raise ValueError("image preparation command failed: " + result.stderr[-2000:])
    if len(result.stdout) > 2_000_000:
        raise ValueError("image preparation output exceeds limit")
    return result.stdout


def artifacts(library, mod_id, source_sha, manager_sha):
    if mod_id not in PACKAGES or not re.fullmatch(SHA, source_sha) or not re.fullmatch(SHA, manager_sha):
        raise ValueError("reviewed Mod identity and full source SHAs required")
    location = Path(library) / mod_id
    if location.resolve() != location or not location.is_dir() or location.is_symlink():
        raise ValueError("artifact library must be an explicit real path")
    receipt_file = location / "receipt.json"
    if receipt_file.is_symlink():
        raise ValueError("symlink receipt refused")
    receipt = json.loads(receipt_file.read_text())
    if receipt.get("installed") is not True or receipt.get("sha") != source_sha or receipt.get("managerSha") != manager_sha:
        raise ValueError("library receipt differs from reviewed source pins")
    if receipt.get("manifest", {}).get("bundle_id") != "org.vllm-hust." + mod_id:
        raise ValueError("wrong bundle identity")
    wheels = receipt.get("wheels", {})
    if len(wheels) != 2:
        raise ValueError("exactly one Mod wheel and one Manager wheel required")
    validated = []
    expected = {PACKAGES[mod_id], "vllm-hust-ext"}
    for name, digest in wheels.items():
        if not re.fullmatch(r"[A-Za-z0-9_.+-]+\.whl", name) or not re.fullmatch(DIGEST, digest):
            raise ValueError("invalid artifact name or digest")
        file = location / "wheels" / name
        if file.is_symlink() or file.resolve() != file or not file.is_file():
            raise ValueError("artifact is not a real library file")
        if hashlib.sha256(file.read_bytes()).hexdigest() != digest:
            raise ValueError("artifact hash changed")
        with zipfile.ZipFile(file) as wheel:
            metadata = [n for n in wheel.namelist() if n.endswith(".dist-info/METADATA")]
            if len(metadata) != 1:
                raise ValueError("invalid wheel metadata")
            parsed = email.parser.Parser().parsestr(wheel.read(metadata[0]).decode())
            package = canonical(parsed["Name"] or "")
            if package not in expected:
                raise ValueError("wheel would replace an unreviewed package")
            metadata_root = metadata[0].split("/")[0]
            for member in wheel.namelist():
                parts = member.split("/")
                if parts[0] not in {MODULES[package], metadata_root} or ".." in parts:
                    raise ValueError("wheel writes outside its owned package namespace")
            entrypoints = metadata_root + "/entry_points.txt"
            if entrypoints in wheel.namelist():
                entries = configparser.ConfigParser(interpolation=None)
                entries.read_string(wheel.read(entrypoints).decode())
                if entries.has_section("console_scripts") and set(entries["console_scripts"]) & {"vllm", "vllm-hust", "python", "python3", "pip", "pip3"}:
                    raise ValueError("wheel replaces a serving runtime command")
            expected.remove(package)
            validated.append({"path": file, "filename": name, "sha256": digest, "package": package, "version": parsed["Version"]})
    if expected:
        raise ValueError("required artifact missing")
    return validated


def validate_python(python_bin):
    if not isinstance(python_bin, str) or not re.fullmatch(r"/[A-Za-z0-9_./-]+/python(?:[0-9.]*)?", python_bin) or "/../" in python_bin:
        raise ValueError("explicit serving Python path required")


def dockerfile(image_id, prepared_id, python_bin):
    validate_python(python_bin)
    if not re.fullmatch("sha256:" + DIGEST, image_id) or not re.fullmatch(r"[a-f0-9]{32}", prepared_id):
        raise ValueError("immutable image ID and preparation ID required")
    return f'''FROM {image_id}
COPY wheels/ /opt/workstation-mod/artifacts/
RUN {python_bin} -m pip install --no-index --no-deps --no-cache-dir --force-reinstall /opt/workstation-mod/artifacts/*.whl
ENV VLLMHUST_EXT_ENABLED_BUNDLES=""
LABEL ai.vllm-hust.workstation.mod.preparation="{prepared_id}"
'''


def isolated_python(command, image_id, python_bin):
    return [*command, "run", "--rm", "--pull=never", "--network=none", "--read-only", "--cap-drop=ALL", "--security-opt=no-new-privileges", "--pids-limit=64", "--memory=512m", "--cpus=1", "--entrypoint=" + python_bin, image_id]


def probe(command, image_id, packages, execute, python_bin):
    output = execute([*isolated_python(command, image_id, python_bin), "-c", PROBE, *packages])
    return json.loads(output)


def prepare(library, output_root, mod_id, source_sha, manager_sha, base_image_id, command, execute=run, *, python_bin):
    validate_python(python_bin)
    validated = artifacts(library, mod_id, source_sha, manager_sha)
    if not re.fullmatch("sha256:" + DIGEST, base_image_id):
        raise ValueError("base image must be pinned to its full local image ID")
    output_root = Path(output_root)
    if output_root.resolve() != output_root or not output_root.is_dir() or output_root.is_symlink() or output_root.stat().st_mode & 0o077:
        raise ValueError("preparation output must be an existing private real directory")
    base = json.loads(execute([*command, "image", "inspect", base_image_id]))[0]
    if base["Id"] != base_image_id:
        raise ValueError("base image identity mismatch")
    environment = probe(command, base_image_id, ["vllm", "vllm-ascend", "packaging", "platformdirs"], execute, python_bin)
    if set(environment) != {"vllm", "vllm-ascend", "packaging", "platformdirs"}:
        raise ValueError("base runtime package evidence is incomplete")
    baseline = {key: environment[key] for key in ("vllm", "vllm-ascend")}
    for package in baseline.values():
        if not isinstance(package, dict) or not re.fullmatch(DIGEST, package.get("wheelSha256") or ""):
            raise ValueError("base runtime lacks immutable wheel metadata")
    check_manager_dependency("packaging", environment["packaging"], 24)
    needs_support = environment["platformdirs"] is None
    if not needs_support:
        check_manager_dependency("platformdirs", environment["platformdirs"], 4)
    identifier = uuid.uuid4().hex
    context = Path(tempfile.mkdtemp(prefix="prepare-" + mod_id + "-", dir=output_root))
    (context / "wheels").mkdir()
    tag = "workstation-mod-prepared:" + identifier
    result = {"schema": "workstation.mod-prepared-image/v1", "id": identifier, "modId": mod_id, "sourceSha": source_sha, "managerSha": manager_sha, "baseImageId": base_image_id, "pythonBin": python_bin, "preparationTag": tag, "status": "building", "runtimeActivationVerified": False}
    atomic_write(context / "receipt.json", result)
    try:
        for item in validated:
            destination = context / "wheels" / item["filename"]
            shutil.copyfile(item["path"], destination)
            if hashlib.sha256(destination.read_bytes()).hexdigest() != item["sha256"]:
                raise ValueError("artifact changed while staging")
        if needs_support:
            download_support(context / "wheels" / SUPPORT["filename"])
            validated.append(dict(SUPPORT))
        (context / "Dockerfile").write_text(dockerfile(base_image_id, identifier, python_bin))
        # Only wheel bytes and the Dockerfile are sent to the daemon, never an
        # application checkout, deployment secrets, receipts or earlier releases.
        (context / ".dockerignore").write_text("*\n!Dockerfile\n!wheels\n!wheels/*.whl\n")
        execute([*command, "build", "--network=none", "--pull=false", "--tag", tag, str(context)])
        image = json.loads(execute([*command, "image", "inspect", tag]))[0]
        image_id = image["Id"]
        if not re.fullmatch("sha256:" + DIGEST, image_id):
            raise ValueError("prepared image is not immutable")
        result["imageId"] = image_id
        base_layers = base["RootFS"]["Layers"]
        if not base_layers or image["RootFS"]["Layers"][:len(base_layers)] != base_layers:
            raise ValueError("prepared image does not extend the pinned base")
        installed = probe(command, image_id, sorted({*environment, *(item["package"] for item in validated)}), execute, python_bin)
        existing = {key: value for key, value in environment.items() if value is not None}
        if {key: installed[key] for key in existing} != existing:
            raise ValueError("image build changed a serving runtime package")
        for item in validated:
            if installed[item["package"]] != {"version": item["version"], "wheelSha256": item["sha256"]}:
                raise ValueError("prepared Mod package differs from reviewed wheel")
        bundle = json.loads(execute([*isolated_python(command, image_id, python_bin), "-c", "from vllm_hust_ext.cli import main; raise SystemExit(main())", "extension", "validate", "org.vllm-hust." + mod_id]))
        if bundle.get("bundle_id") != "org.vllm-hust." + mod_id or canonical(bundle.get("distribution", "")) != PACKAGES[mod_id]:
            raise ValueError("prepared bundle registration is invalid")
        result.update(status="prepared", imageId=image_id, runtimePackages=baseline, bundle={"id": bundle["bundle_id"], "version": bundle["distribution_version"], "declaredHost": bundle["host"]}, artifacts=[{key: value for key, value in item.items() if key != "path"} for item in validated])
        atomic_write(context / "receipt.json", result)
        return {**result, "receiptPath": str(context / "receipt.json")}
    except Exception:
        result["status"] = "failed"
        atomic_write(context / "receipt.json", result)
        raise


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--library", required=True)
    parser.add_argument("--output-root", required=True)
    parser.add_argument("--mod", choices=PACKAGES, required=True)
    parser.add_argument("--source-sha", required=True)
    parser.add_argument("--manager-sha", required=True)
    parser.add_argument("--base-image-id", required=True)
    parser.add_argument("--python-bin", required=True, help="Exact serving interpreter inside the selected runtime image")
    parser.add_argument("--sudo", action="store_true")
    args = parser.parse_args()
    result = prepare(args.library, args.output_root, args.mod, args.source_sha, args.manager_sha, args.base_image_id, ["sudo", "-n", "docker"] if args.sudo else ["docker"], python_bin=args.python_bin)
    print(json.dumps(result, indent=2))


if __name__ == "__main__":
    main()
