#!/usr/bin/env python3

from __future__ import annotations

import argparse
import asyncio
import logging
import signal
from dataclasses import asdict


def _build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Persistent EvoScientist channel worker for workstation")
    parser.add_argument("--workspace-dir", required=True)
    parser.add_argument("--thread-id", default="")
    parser.add_argument("--health-port", type=int, default=39190)
    return parser


async def _run_worker(workspace_dir: str, thread_id: str, health_port: int) -> None:
    from EvoScientist.EvoScientist import create_cli_agent
    from EvoScientist.channels import ChannelManager, InboundConsumer, MessageBus
    from EvoScientist.config.settings import load_config

    config = load_config()
    bus = MessageBus()
    manager = ChannelManager.from_config(config, bus)
    manager._health_port = health_port

    agent = create_cli_agent(workspace_dir=workspace_dir)
    consumer = InboundConsumer(
        bus=bus,
        manager=manager,
        agent=agent,
        thread_id=thread_id,
        send_thinking=bool(getattr(config, "channel_send_thinking", True)),
    )
    manager.register_health_provider("consumer", lambda: asdict(consumer.metrics))

    stop_event = asyncio.Event()
    stopping = False

    async def _shutdown() -> None:
        nonlocal stopping
        if stopping:
            return
        stopping = True
        try:
            await consumer.stop()
        finally:
            await manager.stop_all()
            stop_event.set()

    loop = asyncio.get_running_loop()
    for sig in (signal.SIGINT, signal.SIGTERM):
        try:
            loop.add_signal_handler(sig, lambda: asyncio.create_task(_shutdown()))
        except NotImplementedError:
            pass

    manager_task = asyncio.create_task(manager.start_all())
    consumer_task = asyncio.create_task(consumer.run())

    done, pending = await asyncio.wait(
        [manager_task, consumer_task, asyncio.create_task(stop_event.wait())],
        return_when=asyncio.FIRST_COMPLETED,
    )

    if not stop_event.is_set():
        await _shutdown()

    for task in pending:
        task.cancel()
    await asyncio.gather(*pending, return_exceptions=True)
    await asyncio.gather(*done, return_exceptions=True)


def main() -> int:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
    args = _build_parser().parse_args()
    try:
        asyncio.run(_run_worker(args.workspace_dir, args.thread_id, args.health_port))
    except Exception as exc:
        logging.exception("channel worker failed: %s", exc)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())