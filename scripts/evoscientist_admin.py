#!/usr/bin/env python3

from __future__ import annotations

import argparse
import json
import sys
from dataclasses import fields


def _parse_json(value: str):
    try:
        return json.loads(value)
    except json.JSONDecodeError:
        return value


def _is_sensitive_key(key: str) -> bool:
    sensitive_tokens = ("api_key", "password", "secret", "token", "aes_key")
    return any(token in key for token in sensitive_tokens)


def _snapshot() -> dict:
    from EvoScientist.channels import available_channels
    from EvoScientist.config.settings import get_config_path, list_config
    from EvoScientist.mcp.client import load_mcp_config
    from EvoScientist.tools.skills_manager import list_skills

    config = list_config()
    config_entries = []
    for key in sorted(config):
      value = config.get(key)
      sensitive = _is_sensitive_key(key)
      has_value = value not in (None, "", [], {}, False)
      rendered = "••••••" if sensitive and has_value else json.dumps(value, ensure_ascii=False)
      config_entries.append(
          {
              "key": key,
              "value": rendered,
              "sensitive": sensitive,
              "hasValue": bool(has_value),
          }
      )

    skills = [
        {
            "name": item.name,
            "description": item.description,
            "path": str(item.path),
            "source": item.source,
            "tags": item.tags,
        }
        for item in list_skills(include_system=True)
    ]

    mcp_servers = []
    for name, entry in load_mcp_config().items():
        expose_to = entry.get("expose_to", ["main"])
        if isinstance(expose_to, str):
            expose_to = [expose_to]
        mcp_servers.append(
            {
                "name": name,
                "transport": entry.get("transport", "stdio"),
                "command": entry.get("command"),
                "args": entry.get("args", []),
                "url": entry.get("url"),
                "tools": entry.get("tools", []) or [],
                "exposeTo": expose_to,
                "envKeys": sorted((entry.get("env") or {}).keys()),
                "headerKeys": sorted((entry.get("headers") or {}).keys()),
            }
        )

    configured_channels = [
        item.strip() for item in str(config.get("channel_enabled", "")).split(",") if item.strip()
    ]

    return {
        "config": {
            "path": str(get_config_path()),
            "entries": config_entries,
        },
        "skills": skills,
        "mcpServers": sorted(mcp_servers, key=lambda item: item["name"]),
        "channels": {
            "available": sorted(available_channels()),
            "configured": configured_channels,
            "sendThinking": bool(config.get("channel_send_thinking", True)),
            "sharedWebhookPort": int(config.get("shared_webhook_port", 0) or 0),
        },
    }


def _set_config_values(payload_json: str) -> dict:
    from EvoScientist.config.settings import set_config_value

    payload = json.loads(payload_json)
    if not isinstance(payload, dict):
        raise ValueError("config payload must be a JSON object")

    changed = []
    for key, value in payload.items():
        ok = set_config_value(str(key), value)
        if not ok:
            raise ValueError(f"failed to set config key: {key}")
        changed.append(str(key))

    return {"success": True, "changed": changed}


def _skills_install(source: str) -> dict:
    from EvoScientist.tools.skills_manager import install_skill

    result = install_skill(source)
    if not result.get("success"):
        raise RuntimeError(result.get("error", "skill install failed"))
    return {"success": True, "result": result}


def _skills_uninstall(name: str) -> dict:
    from EvoScientist.tools.skills_manager import uninstall_skill

    result = uninstall_skill(name)
    if not result.get("success"):
        raise RuntimeError(result.get("error", "skill uninstall failed"))
    return {"success": True, "result": result}


def _mcp_upsert(payload_json: str) -> dict:
    from EvoScientist.mcp.client import add_mcp_server

    payload = json.loads(payload_json)
    if not isinstance(payload, dict):
        raise ValueError("MCP payload must be a JSON object")

    name = str(payload.get("name", "")).strip()
    transport = str(payload.get("transport", "stdio")).strip() or "stdio"
    if not name:
        raise ValueError("MCP server name is required")

    entry = add_mcp_server(
        name=name,
        transport=transport,
        command=payload.get("command"),
        args=payload.get("args") or [],
        url=payload.get("url"),
        headers=payload.get("headers") or None,
        env=payload.get("env") or None,
        tools=payload.get("tools") or None,
        expose_to=payload.get("exposeTo") or None,
    )
    return {"success": True, "entry": entry}


def _mcp_remove(name: str) -> dict:
    from EvoScientist.mcp.client import remove_mcp_server

    if not remove_mcp_server(name):
        raise RuntimeError(f"MCP server not found: {name}")
    return {"success": True, "name": name}


def _channels_update(payload_json: str) -> dict:
    from EvoScientist.config.settings import set_config_value

    payload = json.loads(payload_json)
    if not isinstance(payload, dict):
        raise ValueError("channels payload must be a JSON object")

    enabled = payload.get("enabled") or []
    if not isinstance(enabled, list):
        raise ValueError("enabled must be a string array")

    set_config_value("channel_enabled", ",".join(str(item).strip() for item in enabled if str(item).strip()))
    if "sendThinking" in payload:
        set_config_value("channel_send_thinking", bool(payload["sendThinking"]))
    if "sharedWebhookPort" in payload:
        set_config_value("shared_webhook_port", int(payload["sharedWebhookPort"] or 0))

    return {"success": True}


def _build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Workstation bridge for EvoScientist admin operations")
    subparsers = parser.add_subparsers(dest="command", required=True)

    subparsers.add_parser("snapshot")

    set_config = subparsers.add_parser("set-config-values")
    set_config.add_argument("--payload-json", required=True)

    skills_install = subparsers.add_parser("skills-install")
    skills_install.add_argument("--source", required=True)

    skills_uninstall = subparsers.add_parser("skills-uninstall")
    skills_uninstall.add_argument("--name", required=True)

    mcp_upsert = subparsers.add_parser("mcp-upsert")
    mcp_upsert.add_argument("--payload-json", required=True)

    mcp_remove = subparsers.add_parser("mcp-remove")
    mcp_remove.add_argument("--name", required=True)

    channels_update = subparsers.add_parser("channels-update")
    channels_update.add_argument("--payload-json", required=True)

    return parser


def main() -> int:
    parser = _build_parser()
    args = parser.parse_args()

    try:
        if args.command == "snapshot":
            payload = _snapshot()
        elif args.command == "set-config-values":
            payload = _set_config_values(args.payload_json)
        elif args.command == "skills-install":
            payload = _skills_install(args.source)
        elif args.command == "skills-uninstall":
            payload = _skills_uninstall(args.name)
        elif args.command == "mcp-upsert":
            payload = _mcp_upsert(args.payload_json)
        elif args.command == "mcp-remove":
            payload = _mcp_remove(args.name)
        elif args.command == "channels-update":
            payload = _channels_update(args.payload_json)
        else:
            raise ValueError(f"unknown command: {args.command}")
    except Exception as exc:
        print(json.dumps({"success": False, "error": str(exc)}, ensure_ascii=False))
        return 1

    print(json.dumps(payload, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())