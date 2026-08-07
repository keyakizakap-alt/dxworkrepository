#!/usr/bin/env python3
"""Scaffold a new Agent Plugins v1.0.0 package.

Creates the portable core (``plugin.json`` plus an optional first skill) and,
with ``--claude-code``, the Claude Code extension manifest so the same directory
loads in this environment without a second package.

Usage:
    ap_new.py NAME [--dir plugins] [--skill SKILL_NAME] [--mcp] [--claude-code]
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

PLUGIN_SCHEMA_ID = "https://agent-plugins.org/schemas/1.0.0/plugin.schema.json"
MCP_SCHEMA_ID = "https://agent-plugins.org/schemas/1.0.0/mcp.schema.json"
NAME_RE = re.compile(r"^(?!.*(?:--|\.\.))[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$")

SKILL_TEMPLATE = """---
name: {skill}
description: {description}
---

# {title}

Describe when this skill applies and what it does.

## Workflow

1. Restate the goal and confirm the inputs.
2. Do the work.
3. Report what changed and what still needs a human decision.
"""


def write(path: Path, content: str, force: bool) -> None:
    if path.exists() and not force:
        raise SystemExit(f"error: {path} already exists (use --force to overwrite)")
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(content, encoding="utf-8")
    print(f"created {path}")


def main(argv: list[str]) -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("name", help="plugin name (lowercase, digits, hyphens, periods)")
    parser.add_argument("--dir", type=Path, default=Path("plugins"), help="parent directory (default: plugins)")
    parser.add_argument("--skill", help="also scaffold skills/<SKILL>/SKILL.md")
    parser.add_argument("--mcp", action="store_true", help="also scaffold an empty mcp.json")
    parser.add_argument("--claude-code", action="store_true", help="also write .claude-plugin/plugin.json")
    parser.add_argument("--description", default="", help="plugin description")
    parser.add_argument("--force", action="store_true", help="overwrite existing files")
    args = parser.parse_args(argv)

    if not NAME_RE.match(args.name) or len(args.name) > 64:
        raise SystemExit(
            f"error: {args.name!r} is not a valid plugin name; use 1-64 lowercase letters, digits, "
            "hyphens, and periods, starting and ending alphanumeric, with no '--' or '..'"
        )

    root = args.dir / args.name
    description = args.description or f"{args.name} Agent Plugin."

    manifest = {
        "$schema": PLUGIN_SCHEMA_ID,
        "name": args.name,
        "version": "0.1.0",
        "description": description,
        "license": "MIT",
    }
    write(root / "plugin.json", json.dumps(manifest, indent=2, ensure_ascii=False) + "\n", args.force)

    if args.claude_code:
        cc = {"name": args.name, "version": "0.1.0", "description": description, "license": "MIT"}
        write(root / ".claude-plugin" / "plugin.json", json.dumps(cc, indent=2, ensure_ascii=False) + "\n", args.force)

    if args.skill:
        if not NAME_RE.match(args.skill):
            raise SystemExit(f"error: {args.skill!r} is not a valid skill directory name")
        body = SKILL_TEMPLATE.format(
            skill=args.skill,
            description=f"TODO: state when to use {args.skill}. This text is what an agent matches on.",
            title=args.skill.replace("-", " ").title(),
        )
        write(root / "skills" / args.skill / "SKILL.md", body, args.force)

    if args.mcp:
        mcp = {"$schema": MCP_SCHEMA_ID, "mcpServers": {}}
        write(root / "mcp.json", json.dumps(mcp, indent=2, ensure_ascii=False) + "\n", args.force)

    print(f"\nnext: python3 {Path(__file__).name} --help, then validate with ap_validate.py {root}")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
