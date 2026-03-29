#!/usr/bin/env python3
import argparse
import asyncio
import json
import sys


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Stream EvoScientist events as NDJSON")
    group = parser.add_mutually_exclusive_group(required=True)
    group.add_argument("--prompt")
    group.add_argument("--resume-json")
    parser.add_argument("--thread-id", required=True)
    parser.add_argument("--workspace-dir", required=True)
    parser.add_argument("--model", required=True)
    return parser.parse_args()


async def main() -> int:
    args = parse_args()

    from EvoScientist.EvoScientist import create_cli_agent
    from EvoScientist.cli._constants import build_metadata
    from EvoScientist.sessions import get_checkpointer
    from EvoScientist.stream.events import stream_agent_events
    from langgraph.types import Command

    message = args.prompt
    if args.resume_json is not None:
        message = Command(resume=json.loads(args.resume_json))

    async with get_checkpointer() as checkpointer:
        agent = create_cli_agent(
            workspace_dir=args.workspace_dir,
            checkpointer=checkpointer,
        )
        metadata = build_metadata(args.workspace_dir, args.model)
        async for event in stream_agent_events(
            agent,
            message,
            args.thread_id,
            metadata=metadata,
        ):
            sys.stdout.write(json.dumps(event, ensure_ascii=False) + "\n")
            sys.stdout.flush()

    return 0


if __name__ == "__main__":
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(line_buffering=True)
    raise SystemExit(asyncio.run(main()))