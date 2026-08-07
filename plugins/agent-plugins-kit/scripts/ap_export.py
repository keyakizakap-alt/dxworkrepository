#!/usr/bin/env python3
"""Export a portable Agent Plugins ``mcp.json`` to client-native MCP configs.

One portable file stays the source of truth; each client gets the shape it
actually reads. Agent Plugins leaves installation and configuration format to
each client, so this bridges that gap without forking the source config.

Usage:
    ap_export.py --plugin DIR --client claude-code [--out PATH] [--write]
    ap_export.py --plugin DIR --client all --write

Clients:
    claude-code   .mcp.json                {"mcpServers": {...}}, type http|sse|stdio
    vscode        .vscode/mcp.json         {"servers": {...}}
    cursor        .cursor/mcp.json         {"mcpServers": {...}}
    codex         .codex/config.toml       [mcp_servers.NAME] fragment

Without --write the result goes to stdout, so you can diff before adopting it.
"""

from __future__ import annotations

import argparse
import json
import shlex
import sys
from pathlib import Path

MCP_SCHEMA_ID = "https://agent-plugins.org/schemas/1.0.0/mcp.schema.json"

DEFAULT_OUT = {
    "claude-code": Path(".mcp.json"),
    "vscode": Path(".vscode/mcp.json"),
    "cursor": Path(".cursor/mcp.json"),
    "codex": Path(".codex/config.toml"),
}
CLIENTS = tuple(DEFAULT_OUT)


def load_mcp(plugin: Path) -> dict:
    path = plugin / "mcp.json"
    if not path.is_file():
        raise SystemExit(f"error: no mcp.json at {path}")
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        raise SystemExit(f"error: {path} is not valid JSON: {exc}") from exc
    if data.get("$schema") != MCP_SCHEMA_ID:
        print(
            f"warning: {path} declares $schema {data.get('$schema')!r}, expected {MCP_SCHEMA_ID!r}",
            file=sys.stderr,
        )
    servers = data.get("mcpServers")
    if not isinstance(servers, dict):
        raise SystemExit(f"error: {path} has no 'mcpServers' object")
    return servers


def expand(value: str, plugin_root: Path, plugin_data: Path) -> str:
    """Textual, single-pass, non-recursive expansion of the reserved variables.

    Target clients do not define PLUGIN_ROOT/PLUGIN_DATA, so the exported config
    carries resolved absolute paths instead of the placeholders.
    """
    out = []
    i = 0
    while i < len(value):
        if value.startswith("${PLUGIN_ROOT}", i):
            out.append(str(plugin_root))
            i += len("${PLUGIN_ROOT}")
        elif value.startswith("${PLUGIN_DATA}", i):
            out.append(str(plugin_data))
            i += len("${PLUGIN_DATA}")
        else:
            out.append(value[i])
            i += 1
    return "".join(out)


def resolve(server: dict, plugin_root: Path, plugin_data: Path) -> dict:
    """Return the server with placeholders expanded and paths made absolute."""
    out = dict(server)
    if out.get("type") != "stdio":
        return out

    command = out["command"]
    # A './'-prefixed command is plugin-relative; a bare name stays on PATH.
    if command.startswith("./"):
        out["command"] = str((plugin_root / command[2:]).resolve())

    if "args" in out:
        out["args"] = [expand(a, plugin_root, plugin_data) for a in out["args"]]
    if "env" in out:
        out["env"] = {k: expand(v, plugin_root, plugin_data) for k, v in out["env"].items()}
    if "cwd" in out:
        cwd = out["cwd"]
        if cwd.startswith("./"):
            out["cwd"] = str((plugin_root / cwd[2:]).resolve())
        else:
            out["cwd"] = str(Path(expand(cwd, plugin_root, plugin_data)).resolve())
    else:
        out["cwd"] = str(plugin_root)

    # Reserved variables are supplied by an Agent Plugins client; other clients
    # need them passed explicitly for the server to behave the same way.
    env = dict(out.get("env", {}))
    env.setdefault("PLUGIN_ROOT", str(plugin_root))
    env.setdefault("PLUGIN_DATA", str(plugin_data))
    out["env"] = env
    return out


def to_generic(servers: dict, plugin_root: Path, plugin_data: Path, http_type: str) -> dict:
    """Common object form: stdio passthrough, remote transports renamed."""
    result = {}
    for name, server in servers.items():
        resolved = resolve(server, plugin_root, plugin_data)
        transport = resolved.get("type")
        if transport == "stdio":
            entry = {"type": "stdio", "command": resolved["command"]}
            for key in ("args", "env", "cwd"):
                if resolved.get(key):
                    entry[key] = resolved[key]
        elif transport == "streamable-http":
            entry = {"type": http_type, "url": resolved["url"]}
            if resolved.get("headers"):
                entry["headers"] = resolved["headers"]
        elif transport == "sse":
            entry = {"type": "sse", "url": resolved["url"]}
            if resolved.get("headers"):
                entry["headers"] = resolved["headers"]
        else:
            print(f"warning: skipping {name!r}: unknown transport {transport!r}", file=sys.stderr)
            continue
        result[name] = entry
    return result


def render_json(payload: dict) -> str:
    return json.dumps(payload, indent=2, ensure_ascii=False) + "\n"


def toml_string(value: str) -> str:
    return json.dumps(value)  # JSON string escaping is valid TOML basic-string escaping


def to_codex(servers: dict, plugin_root: Path, plugin_data: Path) -> str:
    """Codex reads TOML; emit a fragment to merge into ~/.codex/config.toml."""
    lines = ["# Generated by ap_export.py from the portable Agent Plugins mcp.json.",
             "# Merge into ~/.codex/config.toml.", ""]
    for name, server in servers.items():
        resolved = resolve(server, plugin_root, plugin_data)
        lines.append(f"[mcp_servers.{name}]")
        if resolved.get("type") == "stdio":
            lines.append(f"command = {toml_string(resolved['command'])}")
            if resolved.get("args"):
                lines.append("args = [" + ", ".join(toml_string(a) for a in resolved["args"]) + "]")
            if resolved.get("cwd"):
                lines.append(f"cwd = {toml_string(resolved['cwd'])}")
            if resolved.get("env"):
                lines.append("")
                lines.append(f"[mcp_servers.{name}.env]")
                for key, value in resolved["env"].items():
                    lines.append(f"{key} = {toml_string(value)}")
        else:
            lines.append(f"url = {toml_string(resolved['url'])}")
            if resolved.get("headers"):
                lines.append("")
                lines.append(f"[mcp_servers.{name}.http_headers]")
                for key, value in resolved["headers"].items():
                    lines.append(f"{toml_string(key)} = {toml_string(value)}")
        lines.append("")
    return "\n".join(lines)


def render(client: str, servers: dict, plugin_root: Path, plugin_data: Path) -> str:
    if client == "claude-code":
        # Claude Code names the current remote transport "http".
        return render_json({"mcpServers": to_generic(servers, plugin_root, plugin_data, "http")})
    if client == "vscode":
        return render_json({"servers": to_generic(servers, plugin_root, plugin_data, "http")})
    if client == "cursor":
        return render_json({"mcpServers": to_generic(servers, plugin_root, plugin_data, "http")})
    if client == "codex":
        return to_codex(servers, plugin_root, plugin_data)
    raise SystemExit(f"error: unknown client {client!r}")


def main(argv: list[str]) -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--plugin", type=Path, default=Path("."), help="plugin directory (default: .)")
    parser.add_argument(
        "--client",
        default="claude-code",
        choices=(*CLIENTS, "all"),
        help="target client (default: claude-code)",
    )
    parser.add_argument("--out", type=Path, help="output path; overrides the client default")
    parser.add_argument("--write", action="store_true", help="write files instead of printing")
    parser.add_argument(
        "--plugin-data",
        type=Path,
        help="value for ${PLUGIN_DATA} (default: <plugin>/.data)",
    )
    args = parser.parse_args(argv)

    plugin_root = args.plugin.resolve()
    plugin_data = (args.plugin_data or plugin_root / ".data").resolve()
    servers = load_mcp(plugin_root)
    if not servers:
        print("note: mcp.json declares no servers; nothing to export", file=sys.stderr)

    targets = CLIENTS if args.client == "all" else (args.client,)
    if args.out and len(targets) > 1:
        raise SystemExit("error: --out cannot be combined with --client all")

    for client in targets:
        content = render(client, servers, plugin_root, plugin_data)
        if not args.write:
            if len(targets) > 1:
                print(f"----- {client}: {DEFAULT_OUT[client]} -----")
            print(content, end="")
            continue
        out = args.out or (plugin_root / DEFAULT_OUT[client])
        out.parent.mkdir(parents=True, exist_ok=True)
        out.write_text(content, encoding="utf-8")
        print(f"wrote {out}")

    if args.write:
        print(
            f"\nreminder: {shlex.quote(str(plugin_data))} is the ${{PLUGIN_DATA}} directory; "
            "create it if a server writes there.",
            file=sys.stderr,
        )
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
