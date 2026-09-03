"""Read-only process launch projection; also embedded in the container collector.

Only explicitly supplied, allowlisted options are evidence. Missing options are
unknown, not guessed defaults. This is not the engine's effective configuration.
"""
import json
import os
from pathlib import Path


VALUE_OPTIONS = {
    "--tensor-parallel-size": "tensorParallel", "-tp": "tensorParallel",
    "--pipeline-parallel-size": "pipelineParallel", "-pp": "pipelineParallel",
    "--max-num-seqs": "maxNumSeqs", "--dtype": "dtype",
    "--quantization": "quantization", "--speculative-config": "speculativeConfig",
}
BOOL_OPTIONS = {
    "--enforce-eager": ("enforceEager", True),
    "--no-enforce-eager": ("enforceEager", False),
    "--enable-prefix-caching": ("prefixCaching", True),
    "--no-enable-prefix-caching": ("prefixCaching", False),
    "--async-scheduling": ("asyncScheduling", True),
    "--no-async-scheduling": ("asyncScheduling", False),
}


def parse_options(args):
    result = {}
    seen = set()
    ambiguous = set()
    for index, item in enumerate(args):
        flag, separator, value = item.partition("=")
        if flag in BOOL_OPTIONS:
            key, parsed = BOOL_OPTIONS[flag]
            if separator:
                # Never guess argparse's accepted boolean syntax.
                parsed = None
        elif flag in VALUE_OPTIONS:
            key = VALUE_OPTIONS[flag]
            if not separator:
                value = args[index + 1] if index + 1 < len(args) else ""
            parsed = value if value and not value.startswith("-") else None
            if key in {"tensorParallel", "pipelineParallel", "maxNumSeqs"}:
                parsed = int(value) if value.isascii() and value.isdigit() and 0 < int(value) < 100000 else None
            elif key == "speculativeConfig":
                try:
                    spec = json.loads(value)
                    if not isinstance(spec, dict):
                        raise ValueError()
                    # Never emit arbitrary nested options, paths or secrets.
                    parsed = {k: v for k, v in spec.items() if k in {"method", "num_speculative_tokens", "enforce_eager", "disable_padded_drafter_batch"} and type(v) in {str, int, bool} and len(str(v)) < 100}
                except (ValueError, TypeError):
                    parsed = None
            elif key == "dtype":
                parsed = value if value in {"auto", "float16", "half", "bfloat16", "float", "float32"} else None
            elif key == "quantization":
                # Only presence is relevant. Avoid returning arbitrary CLI text.
                parsed = "configured" if parsed else None
        else:
            continue
        if key in seen:
            ambiguous.add(key)
        seen.add(key)
        result[key] = parsed
    for key in ambiguous:
        result[key] = None
    return result


def process_start(directory):
    fields = (directory / "stat").read_text().rsplit(")", 1)[1].split()
    if fields[0] in {"Z", "X", "x"}:
        raise ValueError("process is not live")
    return int(fields[19])


def collect_launch(proc=Path("/proc")):
    unavailable = {"available": False, "evidenceLevel": "process-command-line", "reason": "unique stable serving process unavailable"}
    candidates = []
    directories = list(proc.iterdir())
    if len(directories) > 16384:
        return unavailable
    for directory in directories:
        if not directory.name.isdigit():
            continue
        try:
            started = process_start(directory)
            raw = (directory / "cmdline").read_bytes()
            if len(raw) > 65536:
                continue
            args = raw.decode().rstrip("\0").split("\0")
            entry = next((i for i, arg in enumerate(args[:3]) if os.path.basename(arg) == "vllm" and args[i + 1:i + 2] == ["serve"]), None)
            if entry is None:
                continue
            options = parse_options(args[entry + 2:])
            # Do not return raw argv or an argv hash (credentials can appear there).
            if process_start(directory) != started or (directory / "cmdline").read_bytes() != raw:
                return unavailable
            candidates.append({"pid": int(directory.name), "startTicks": started, "options": options})
        except (OSError, ValueError, IndexError, UnicodeError):
            continue
    if len(candidates) != 1:
        return unavailable
    candidate = candidates[0]
    # Bracket the whole scan, not merely the read of each process.
    try:
        if process_start(proc / str(candidate["pid"])) != candidate["startTicks"]:
            return unavailable
    except (OSError, ValueError, IndexError):
        return unavailable
    return {"available": True, "evidenceLevel": "process-command-line", **candidate}
