---
name: validate-agent-plugin
description: Check that a directory conforms to the Agent Plugins v1.0.0 specification before committing or publishing it, and interpret the resulting errors and warnings. Use when a plugin fails to load in a client, after editing plugin.json, mcp.json, or a SKILL.md, or when reviewing a plugin someone else wrote.
license: MIT
metadata:
  version: "1.0.0"
---

# Validate an Agent Plugin

Confirm a package conforms to Agent Plugins v1.0.0 before a client has to reject it.

## Run the validator

```bash
python3 plugins/agent-plugins-kit/scripts/ap_validate.py plugins/<name>
```

Useful flags:

| Flag | Effect |
| --- | --- |
| *(none)* | Human-readable report; exits `1` if any error was found. |
| `--json` | Machine-readable output for CI or further processing. |
| `--strict` | Warnings also fail the run. Use this in CI once a plugin is clean. |

Validate every plugin in the repository at once:

```bash
python3 plugins/agent-plugins-kit/scripts/ap_validate.py plugins/*/
```

The validator uses the Python standard library only and reads the schemas vendored at
`plugins/agent-plugins-kit/schemas/1.0.0/`, so it needs no network access and no dependencies.

## What it checks

- **`plugin.json`** — presence, JSON validity, exact `$schema` identifier, `name` length and
  character rules, types of every allowed field, closed `author` sub-object, and `extensions` shaped
  as objects keyed by reverse-domain namespaces.
- **`mcp.json`** (if present) — exact `$schema`, closed top level, per-transport required and allowed
  fields, `command` token rules, reserved environment variables, `cwd` rooting, URL scheme and
  loopback/HTTPS rules, and headers that look like credentials.
- **`skills/`** — that each immediate child holding a regular `SKILL.md` parses, has `name` and
  `description` frontmatter, and resolves inside the plugin root.
- **Package containment** — no symlink escapes the plugin root.

Client extension namespaces are detected and listed but never validated: their owner defines their
contents and failure behavior.

## Reading the output

**ERROR** is a condition the specification treats as fatal for the affected component. A manifest
error rejects the whole plugin. An `mcp.json` top-level error disables MCP for the plugin; a
per-server error disables only that server. A skill error skips only that skill.

**WARN** is something a client reports and then ignores, or a recommendation. Unknown top-level
manifest fields land here by design — the specification says to report and ignore them, so the
plugin still loads. Decide on each warning rather than leaving it unread.

## Common failures

| Message | Fix |
| --- | --- |
| `'$schema' must be exactly …` | Copy the canonical identifier verbatim; a version drift or a trailing path segment fails. |
| `unknown top-level field 'hooks'` | Hooks are not portable. Move them to a client extension directory. |
| `placeholder expansion does not apply to 'command'` | Replace `${PLUGIN_ROOT}/bin/x` with `./bin/x`. |
| `'name' … differs from directory name` | Rename one so they match; predictable packaging depends on it. |
| `no SKILL.md at this level` | Skills are only discovered as *immediate* children of `skills/`; nesting deeper hides them. |
| `non-loopback endpoint … must use HTTPS` | Plain HTTP is allowed only for loopback hosts. |

## Report when finished

Give the exit status, every error with its fix, the warnings you deliberately accepted, and the
skills and MCP servers that were discovered.
