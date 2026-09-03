"""Collect existing worker evidence; never import or initialize a Mod."""
import json
import sys

from . import collect


def main():
    payload = sys.stdin.read(8193)
    if len(payload) > 8192:
        raise ValueError("worker context exceeds limit")
    print(json.dumps(collect(json.loads(payload)), allow_nan=False))


if __name__ == "__main__":
    main()
