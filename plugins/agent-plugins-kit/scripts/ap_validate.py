#!/usr/bin/env python3
"""Validate a directory against the Agent Plugins v1.0.0 specification.

Checks the portable core only: the root ``plugin.json`` manifest, the optional
root ``mcp.json``, and skills discovered under ``skills/``. Client extension
namespaces are reported but never validated, per the specification.

Usage:
    ap_validate.py [PLUGIN_DIR ...] [--json] [--strict]

Exit codes:
    0  no errors (warnings may still be printed)
    1  at least one error
    2  bad invocation

Errors are conditions the specification calls fatal for the affected component.
Warnings are conditions a client reports and then ignores, plus recommendations.
"""

from __future__ import annotations

import argparse
import json
import os
import re
import sys
from pathlib import Path
from urllib.parse import urlsplit

SPEC_VERSION = "1.0.0"
PLUGIN_SCHEMA_ID = f"https://agent-plugins.org/schemas/{SPEC_VERSION}/plugin.schema.json"
MCP_SCHEMA_ID = f"https://agent-plugins.org/schemas/{SPEC_VERSION}/mcp.schema.json"

# Manifest: closed set of portable top-level fields.
MANIFEST_FIELDS = {
    "$schema": str,
    "name": str,
    "version": str,
    "description": str,
    "author": dict,
    "homepage": str,
    "repository": str,
    "license": str,
    "keywords": list,
    "extensions": dict,
}
AUTHOR_FIELDS = {"name", "email", "url"}

# 1-64 chars, lowercase alnum/hyphen/period, alnum at both ends, no "--" or "..".
PLUGIN_NAME_RE = re.compile(r"^(?!.*(?:--|\.\.))[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$")
# Reverse-domain extension namespace, e.g. com.anthropic.claude-code.
NAMESPACE_RE = re.compile(r"^[a-zA-Z0-9-]+(\.[a-zA-Z0-9-]+)+$")
# cwd must be plugin-relative or rooted at a reserved plugin variable.
CWD_RE = re.compile(r"^(?:\./|\$\{PLUGIN_ROOT\}(?:/|$)|\$\{PLUGIN_DATA\}(?:/|$))")
RESERVED_ENV = {"PLUGIN_ROOT", "PLUGIN_DATA"}
LOOPBACK_HOSTS = {"localhost", "127.0.0.1", "::1", "[::1]"}

TRANSPORTS = {
    "stdio": ({"type", "command"}, {"type", "command", "args", "env", "cwd"}),
    "streamable-http": ({"type", "url"}, {"type", "url", "headers"}),
    "sse": ({"type", "url"}, {"type", "url", "headers"}),
}


class Report:
    """Collects diagnostics for one plugin directory."""

    def __init__(self, root: Path) -> None:
        self.root = root
        self.errors: list[str] = []
        self.warnings: list[str] = []
        self.info: dict[str, object] = {}

    def error(self, where: str, message: str) -> None:
        self.errors.append(f"{where}: {message}")

    def warn(self, where: str, message: str) -> None:
        self.warnings.append(f"{where}: {message}")


def load_json(path: Path, report: Report, where: str):
    """Return parsed JSON, or None when the file is unreadable or malformed."""
    try:
        text = path.read_text(encoding="utf-8")
    except OSError as exc:
        report.error(where, f"cannot read file ({exc.strerror})")
        return None
    try:
        return json.loads(text)
    except json.JSONDecodeError as exc:
        report.error(where, f"invalid JSON at line {exc.lineno} column {exc.colno}: {exc.msg}")
        return None


def within(root: Path, target: Path) -> bool:
    """True when target resolves inside root. Catches symlink escapes."""
    try:
        target.resolve(strict=True).relative_to(root.resolve(strict=True))
    except (ValueError, OSError):
        return False
    return True


# --------------------------------------------------------------------------- manifest


def validate_manifest(root: Path, report: Report) -> None:
    path = root / "plugin.json"
    where = "plugin.json"
    if not path.is_file():
        report.error(where, "missing required manifest at the plugin root")
        return

    data = load_json(path, report, where)
    if data is None:
        return
    if not isinstance(data, dict):
        report.error(where, "manifest must be a JSON object")
        return

    schema = data.get("$schema")
    if schema is None:
        report.error(where, "missing required field '$schema'")
    elif schema != PLUGIN_SCHEMA_ID:
        report.error(where, f"'$schema' must be exactly {PLUGIN_SCHEMA_ID!r}, got {schema!r}")

    name = data.get("name")
    if name is None:
        report.error(where, "missing required field 'name'")
    elif not isinstance(name, str):
        report.error(where, "'name' must be a string")
    else:
        report.info["name"] = name
        if not 1 <= len(name) <= 64:
            report.error(where, f"'name' must be 1-64 characters, got {len(name)}")
        elif not PLUGIN_NAME_RE.match(name):
            report.error(
                where,
                f"'name' {name!r} must use lowercase letters, digits, hyphens, and periods, "
                "start and end alphanumeric, and contain no '--' or '..'",
            )
        elif name != root.resolve().name:
            report.warn(
                where,
                f"'name' {name!r} differs from directory name {root.resolve().name!r}; "
                "keeping them identical is recommended for predictable packaging",
            )

    for key, value in data.items():
        expected = MANIFEST_FIELDS.get(key)
        if expected is None:
            # Unknown top-level fields are reported and ignored, not fatal.
            report.warn(where, f"unknown top-level field {key!r} is ignored; use 'extensions' for client data")
        elif not isinstance(value, expected):
            report.error(where, f"'{key}' must be of type {expected.__name__}, got {type(value).__name__}")

    author = data.get("author")
    if isinstance(author, dict):
        for key, value in author.items():
            if key not in AUTHOR_FIELDS:
                report.error(where, f"'author.{key}' is not an allowed field ({', '.join(sorted(AUTHOR_FIELDS))})")
            elif not isinstance(value, str):
                report.error(where, f"'author.{key}' must be a string")

    keywords = data.get("keywords")
    if isinstance(keywords, list):
        for i, item in enumerate(keywords):
            if not isinstance(item, str):
                report.error(where, f"'keywords[{i}]' must be a string")

    extensions = data.get("extensions")
    if isinstance(extensions, dict):
        namespaces = []
        for ns, value in extensions.items():
            if not NAMESPACE_RE.match(ns):
                report.warn(where, f"extension namespace {ns!r} is not a reverse-domain identifier")
            if not isinstance(value, dict):
                report.error(where, f"'extensions.{ns}' must be an object")
            namespaces.append(ns)
        report.info["extensions"] = namespaces


# --------------------------------------------------------------------------- mcp


def validate_url(url: str, where: str, report: Report) -> None:
    parts = urlsplit(url)
    if parts.scheme not in ("http", "https"):
        report.error(where, f"'url' must be an absolute http or https URL, got {url!r}")
        return
    if not parts.hostname:
        report.error(where, f"'url' {url!r} has no host")
        return
    if parts.username or parts.password:
        report.error(where, "'url' must not contain user information")
    if parts.fragment:
        report.error(where, "'url' must not contain a fragment")
    if parts.scheme == "http" and parts.hostname not in LOOPBACK_HOSTS:
        report.error(where, f"non-loopback endpoint {parts.hostname!r} must use HTTPS")


def validate_server(name: str, server, report: Report) -> None:
    where = f"mcp.json: mcpServers.{name}"
    if not isinstance(server, dict):
        report.error(where, "server entry must be an object")
        return

    transport = server.get("type")
    if transport not in TRANSPORTS:
        report.error(where, f"'type' must be one of stdio, streamable-http, sse; got {transport!r}")
        return
    if transport == "sse":
        report.warn(where, "'sse' is the deprecated HTTP+SSE transport; client support is optional")

    required, allowed = TRANSPORTS[transport]
    for field in sorted(required - set(server)):
        report.error(where, f"missing required field {field!r} for transport {transport!r}")
    for field in sorted(set(server) - allowed):
        report.error(where, f"field {field!r} is not allowed for transport {transport!r}")

    if transport == "stdio":
        validate_stdio(server, where, report)
    else:
        url = server.get("url")
        if not isinstance(url, str) or not url:
            if "url" in server:
                report.error(where, "'url' must be a non-empty string")
        else:
            validate_url(url, where, report)
        validate_headers(server.get("headers"), where, report)


def validate_stdio(server: dict, where: str, report: Report) -> None:
    command = server.get("command")
    if "command" in server:
        if not isinstance(command, str) or not command:
            report.error(where, "'command' must be a non-empty string")
        else:
            if "${PLUGIN_ROOT}" in command or "${PLUGIN_DATA}" in command:
                report.error(where, "placeholder expansion does not apply to 'command'")
            if command.startswith(("/", "../")) or re.match(r"^[A-Za-z]:[\\/]", command):
                report.error(
                    where,
                    "'command' must be a bare executable name or a plugin-relative path beginning with './'",
                )
            elif not command.startswith("./") and ("/" in command or "\\" in command):
                report.error(
                    where,
                    "'command' path must begin with './' to be plugin-relative",
                )

    args = server.get("args")
    if "args" in server:
        if not isinstance(args, list):
            report.error(where, "'args' must be an array")
        else:
            for i, item in enumerate(args):
                if not isinstance(item, str):
                    report.error(where, f"'args[{i}]' must be a string")

    env = server.get("env")
    if "env" in server:
        if not isinstance(env, dict):
            report.error(where, "'env' must be an object")
        else:
            for key, value in env.items():
                if key in RESERVED_ENV:
                    report.error(where, f"'env.{key}' overrides a reserved plugin variable")
                if not isinstance(value, str):
                    report.error(where, f"'env.{key}' must be a string")

    cwd = server.get("cwd")
    if "cwd" in server:
        if not isinstance(cwd, str):
            report.error(where, "'cwd' must be a string")
        elif not CWD_RE.match(cwd):
            report.error(
                where,
                "'cwd' must begin with './', '${PLUGIN_ROOT}', or '${PLUGIN_DATA}'",
            )
        elif ".." in Path(cwd).parts:
            report.error(where, "'cwd' must stay within its rooted directory")


def validate_headers(headers, where: str, report: Report) -> None:
    if headers is None:
        return
    if not isinstance(headers, dict):
        report.error(where, "'headers' must be an object")
        return
    for key, value in headers.items():
        if not isinstance(value, str):
            report.error(where, f"'headers.{key}' must be a string")
        elif re.search(r"(authorization|api[-_]?key|token|secret|password)", key, re.I):
            report.warn(
                where,
                f"header {key!r} looks like a credential; headers are literal package data "
                "and must not contain secrets",
            )


def validate_mcp(root: Path, report: Report) -> None:
    path = root / "mcp.json"
    if not path.is_file():
        report.info["mcpServers"] = []
        return

    where = "mcp.json"
    data = load_json(path, report, where)
    if data is None:
        return
    if not isinstance(data, dict):
        report.error(where, "document must be a JSON object")
        return

    schema = data.get("$schema")
    if schema is None:
        report.error(where, "missing required field '$schema'")
    elif schema != MCP_SCHEMA_ID:
        report.error(where, f"'$schema' must be exactly {MCP_SCHEMA_ID!r}, got {schema!r}")

    for key in sorted(set(data) - {"$schema", "mcpServers"}):
        report.error(where, f"unknown top-level field {key!r}; only '$schema' and 'mcpServers' are allowed")

    servers = data.get("mcpServers")
    if servers is None:
        report.error(where, "missing required field 'mcpServers'")
        return
    if not isinstance(servers, dict):
        report.error(where, "'mcpServers' must be an object")
        return

    report.info["mcpServers"] = sorted(servers)
    for name, server in servers.items():
        validate_server(name, server, report)


# --------------------------------------------------------------------------- skills


def parse_frontmatter(text: str):
    """Return the YAML frontmatter block as a dict of top-level scalars.

    Only the shallow key/value pairs the Agent Skills spec requires are read;
    nested structures are skipped rather than parsed.
    """
    if not text.startswith("---"):
        return None
    end = text.find("\n---", 3)
    if end == -1:
        return None
    block = text[text.find("\n") + 1 : end + 1]
    fields: dict[str, str] = {}
    for line in block.splitlines():
        if not line or line.startswith("#") or line[0].isspace():
            continue
        key, sep, value = line.partition(":")
        if not sep:
            continue
        value = value.strip().strip("'\"")
        fields[key.strip()] = value
    return fields


def validate_skill(skill_dir: Path, root: Path, report: Report) -> bool:
    """Validate one discovered skill. Returns True when it loads."""
    where = f"skills/{skill_dir.name}/SKILL.md"
    skill_md = skill_dir / "SKILL.md"

    if not within(root, skill_md):
        report.error(where, "resolves outside the plugin root")
        return False

    try:
        text = skill_md.read_text(encoding="utf-8")
    except OSError as exc:
        report.error(where, f"cannot read file ({exc.strerror})")
        return False

    fields = parse_frontmatter(text)
    if fields is None:
        report.error(where, "missing YAML frontmatter delimited by '---'")
        return False

    ok = True
    name = fields.get("name")
    if not name:
        report.error(where, "frontmatter is missing required field 'name'")
        ok = False
    elif name != skill_dir.name:
        report.warn(where, f"frontmatter name {name!r} does not match directory {skill_dir.name!r}")

    if not fields.get("description"):
        report.error(where, "frontmatter is missing required field 'description'")
        ok = False

    return ok


def validate_skills(root: Path, report: Report) -> None:
    skills_dir = root / "skills"
    report.info["skills"] = []
    if not skills_dir.exists():
        return
    if not skills_dir.is_dir():
        report.error("skills/", "path exists but is not a directory; the skills component type is invalid")
        return

    loaded = []
    for child in sorted(skills_dir.iterdir()):
        if not child.is_dir():
            continue
        # Only an immediate child holding a regular SKILL.md is a discovered skill.
        if not (child / "SKILL.md").is_file():
            report.warn(f"skills/{child.name}/", "no SKILL.md at this level; not discovered as a skill")
            continue
        if validate_skill(child, root, report):
            loaded.append(child.name)
    report.info["skills"] = loaded


# --------------------------------------------------------------------------- containment


def validate_containment(root: Path, report: Report) -> None:
    """Every packaged file must resolve inside the plugin root."""
    resolved_root = root.resolve()
    for dirpath, dirnames, filenames in os.walk(root):
        dirnames[:] = [d for d in dirnames if d != ".git"]
        for entry in list(dirnames) + filenames:
            path = Path(dirpath) / entry
            if path.is_symlink() and not within(resolved_root, path):
                report.error(
                    str(path.relative_to(root)),
                    "symlink escapes the plugin root; packaged files must resolve within it",
                )


def detect_extension_dirs(root: Path, report: Report) -> None:
    dirs = [
        p.name
        for p in sorted(root.iterdir())
        if p.is_dir() and NAMESPACE_RE.match(p.name)
    ]
    report.info["extensionDirectories"] = dirs


# --------------------------------------------------------------------------- driver


def validate_plugin(root: Path) -> Report:
    report = Report(root)
    if not root.is_dir():
        report.error(str(root), "not a directory")
        return report
    validate_manifest(root, report)
    validate_mcp(root, report)
    validate_skills(root, report)
    validate_containment(root, report)
    detect_extension_dirs(root, report)
    return report


def print_report(report: Report, strict: bool) -> None:
    label = report.info.get("name") or report.root.name
    print(f"\n=== {label}  ({report.root}) ===")
    skills = report.info.get("skills") or []
    servers = report.info.get("mcpServers") or []
    print(f"  skills      : {', '.join(skills) if skills else '(none)'}")
    print(f"  mcpServers  : {', '.join(servers) if servers else '(none)'}")
    for key in ("extensions", "extensionDirectories"):
        values = report.info.get(key) or []
        if values:
            print(f"  {key:<12}: {', '.join(values)}")
    for message in report.errors:
        print(f"  ERROR  {message}")
    for message in report.warnings:
        print(f"  WARN   {message}")
    if not report.errors and not report.warnings:
        print("  OK — conforms to Agent Plugins v1.0.0")
    elif not report.errors:
        state = "fails (--strict)" if strict else "conforms to Agent Plugins v1.0.0"
        print(f"  {len(report.warnings)} warning(s); {state}")


def main(argv: list[str]) -> int:
    parser = argparse.ArgumentParser(
        description="Validate directories against the Agent Plugins v1.0.0 specification."
    )
    parser.add_argument("paths", nargs="*", default=["."], help="plugin directories (default: .)")
    parser.add_argument("--json", action="store_true", help="emit machine-readable JSON")
    parser.add_argument("--strict", action="store_true", help="treat warnings as errors")
    args = parser.parse_args(argv)

    roots = [Path(p) for p in (args.paths or ["."])]
    reports = [validate_plugin(root) for root in roots]

    if args.json:
        payload = [
            {
                "path": str(r.root),
                "name": r.info.get("name"),
                "skills": r.info.get("skills") or [],
                "mcpServers": r.info.get("mcpServers") or [],
                "extensions": r.info.get("extensions") or [],
                "extensionDirectories": r.info.get("extensionDirectories") or [],
                "errors": r.errors,
                "warnings": r.warnings,
            }
            for r in reports
        ]
        print(json.dumps(payload, indent=2, ensure_ascii=False))
    else:
        for report in reports:
            print_report(report, args.strict)

    failed = any(r.errors or (args.strict and r.warnings) for r in reports)
    return 1 if failed else 0


if __name__ == "__main__":
    try:
        sys.exit(main(sys.argv[1:]))
    except KeyboardInterrupt:
        sys.exit(130)
