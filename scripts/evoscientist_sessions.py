#!/usr/bin/env python3
import argparse
import asyncio
import json


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Query EvoScientist session metadata")
    subparsers = parser.add_subparsers(dest="command", required=True)

    list_parser = subparsers.add_parser("list")
    list_parser.add_argument("--limit", type=int, default=30)

    metadata_parser = subparsers.add_parser("metadata")
    metadata_parser.add_argument("--thread-id", required=True)
    return parser.parse_args()


async def main() -> int:
    args = parse_args()

    from EvoScientist.sessions import get_thread_metadata, list_threads

    if args.command == "list":
        threads = await list_threads(
            limit=args.limit,
            include_message_count=True,
            include_preview=True,
        )
        payload = {
            "threads": [
                {
                    "threadId": item.get("thread_id", ""),
                    "updatedAt": item.get("updated_at"),
                    "workspaceDir": item.get("workspace_dir", "") or "",
                    "model": item.get("model", "") or "",
                    "messageCount": int(item.get("message_count", 0) or 0),
                    "preview": item.get("preview", "") or "",
                }
                for item in threads
            ]
        }
        print(json.dumps(payload, ensure_ascii=False))
        return 0

    metadata = await get_thread_metadata(args.thread_id)
    if not metadata:
        print("null")
        return 0

    print(
        json.dumps(
            {
                "workspaceDir": metadata.get("workspace_dir", "") or "",
                "model": metadata.get("model", "") or "",
                "updatedAt": metadata.get("updated_at"),
            },
            ensure_ascii=False,
        )
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))