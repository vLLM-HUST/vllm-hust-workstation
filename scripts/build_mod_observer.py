"""Build a deterministic, dependency-free observer wheel from repository sources."""
import base64
import csv
import hashlib
import io
import json
from pathlib import Path
import re
import zipfile

PACKAGE = "workstation-mod-runtime"
VERSION = "0.1.1"
FILENAME = f"workstation_mod_runtime-{VERSION}-py3-none-any.whl"


def build(destination, identity):
    if set(identity) != {"modId", "sourceSha", "wheelSha256", "version", "componentFileSha256"} or identity["modId"] != "diffspec":
        raise ValueError("no reviewed runtime observer for this Mod")
    if not re.fullmatch(r"[a-f0-9]{40}", identity["sourceSha"]) or not re.fullmatch(r"[a-f0-9]{64}", identity["wheelSha256"]) or not re.fullmatch(r"[a-f0-9]{64}", identity["componentFileSha256"]):
        raise ValueError("immutable observer artifact identity required")
    source = Path(__file__).parent / "runtime/workstation_mod_runtime"
    dist = f"workstation_mod_runtime-{VERSION}.dist-info"
    files = {"workstation_mod_runtime/" + name: (source / name).read_bytes() for name in ("__init__.py", "__main__.py")}
    files["workstation_mod_runtime/identity.json"] = json.dumps(identity, sort_keys=True, separators=(",", ":")).encode()
    files[dist + "/METADATA"] = f"Metadata-Version: 2.1\nName: {PACKAGE}\nVersion: {VERSION}\nRequires-Python: >=3.10\n".encode()
    files[dist + "/WHEEL"] = b"Wheel-Version: 1.0\nGenerator: workstation-mod-image\nRoot-Is-Purelib: true\nTag: py3-none-any\n"
    files[dist + "/entry_points.txt"] = b"[vllm.general_plugins]\nworkstation_mod_runtime = workstation_mod_runtime:register\n"
    records = io.StringIO(newline="")
    writer = csv.writer(records)
    for name, payload in sorted(files.items()):
        digest = base64.urlsafe_b64encode(hashlib.sha256(payload).digest()).rstrip(b"=").decode()
        writer.writerow([name, "sha256=" + digest, len(payload)])
    writer.writerow([dist + "/RECORD", "", ""])
    files[dist + "/RECORD"] = records.getvalue().encode()
    destination = Path(destination) / FILENAME
    with zipfile.ZipFile(destination, "x", compression=zipfile.ZIP_STORED) as wheel:
        for name, payload in sorted(files.items()):
            info = zipfile.ZipInfo(name, date_time=(2026, 1, 1, 0, 0, 0))
            info.external_attr = 0o100644 << 16
            wheel.writestr(info, payload)
    return {"filename": FILENAME, "package": PACKAGE, "version": VERSION,
            "sha256": hashlib.sha256(destination.read_bytes()).hexdigest()}
