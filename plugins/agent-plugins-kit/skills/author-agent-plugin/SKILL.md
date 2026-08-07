---
name: author-agent-plugin
description: Create a new Agent Plugins v1.0.0 package, or add a skill or MCP server to an existing one, so it stays portable across Claude Code, VS Code, Cursor, GitHub Copilot, Codex, and Kiro. Use when packaging reusable skills or MCP connections, scaffolding a plugin, or deciding whether something belongs in the portable core or a client extension.
license: MIT
metadata:
  version: "1.0.0"
---

# Author an Agent Plugin

Package reusable components once, in the layout every compatible client reads.

## Source of truth

The [Agent Plugins specification](https://agent-plugins.org/specification) is normative. This
repository vendors the v1.0.0 JSON Schemas at `schemas/1.0.0/` so validation works offline; if
they ever disagree with the published specification, the specification wins.

## The portable core

Only three things are portable in v1.0.0. Everything else is client-owned.

| Location | Contents |
| --- | --- |
| `plugin.json` (required, root) | Identity and metadata. The schema is **closed**. |
| `skills/<name>/SKILL.md` | Agent Skills. Only *immediate* children of `skills/` are discovered. |
| `mcp.json` (optional, root) | MCP servers with an explicit `stdio`, `streamable-http`, or `sse` type. |

Hooks, agents, commands, LSP servers, output styles, themes, and marketplace metadata are **not**
portable v1 components. Never place them at the top level of `plugin.json`.

## Workflow

1. **Scaffold.** From the repository root:

   ```bash
   python3 plugins/agent-plugins-kit/scripts/ap_new.py my-plugin \
       --skill my-first-skill --claude-code
   ```

   `--claude-code` also writes `.claude-plugin/plugin.json`, so the same directory loads in this
   environment as a Claude Code plugin while remaining a valid Agent Plugin.

2. **Write the manifest.** Set `$schema` to the exact canonical identifier and pick a valid `name`:
   1–64 characters, lowercase letters, digits, hyphens, and periods, alphanumeric at both ends, with
   no `--` or `..`. Keep the manifest name identical to the directory name. Allowed optional fields
   are `version`, `description`, `author` (`name`/`email`/`url` only), `homepage`, `repository`,
   `license`, `keywords`, and `extensions` — nothing else.

3. **Add skills.** One directory per skill under `skills/`, each with a `SKILL.md` whose frontmatter
   carries `name` (matching the directory) and `description`. The `description` is what an agent
   matches against, so state the trigger conditions concretely, not just the topic. Supporting files
   go in `scripts/`, `references/`, and `assets/` by convention.

4. **Add MCP servers.** Put them in root `mcp.json`, never in `plugin.json`. See
   [references/mcp-servers.md](references/mcp-servers.md) for transports, the `${PLUGIN_ROOT}` and
   `${PLUGIN_DATA}` rules, and the credential constraint.

5. **Keep client behavior in an extension.** Client-specific files live in a top-level directory
   named exactly after a reverse-domain namespace that the client publishes, and client-specific
   manifest data goes under `extensions`. Never invent a namespace and assume some other client
   will honor it. See `skills/migrate-agent-plugin/references/client-extensions.md`.

6. **Validate before shipping.**

   ```bash
   python3 plugins/agent-plugins-kit/scripts/ap_validate.py plugins/my-plugin
   ```

   Fix every `ERROR`. Treat each `WARN` as a decision to make explicitly.

7. **Export MCP config for the clients in use.**

   ```bash
   python3 plugins/agent-plugins-kit/scripts/ap_export.py --plugin plugins/my-plugin --client all
   ```

   Review the output, then re-run with `--write`. The portable `mcp.json` stays the source of truth;
   generated files are derived and should never be hand-edited.

## Rules that are easy to get wrong

- An unknown top-level manifest field is reported and ignored, but any *other* manifest schema
  violation is fatal and the whole plugin is rejected.
- An invalid `mcp.json` disables MCP for the plugin; one invalid server disables only that entry.
  Skills keep loading either way.
- `command` in a stdio server is a single executable token, not a shell line. Placeholder expansion
  does **not** apply to it. Use a bare name or a `./`-prefixed plugin-relative path.
- Configured headers are literal, visible package data. Credentials must never appear in them;
  v1.0.0 defines no portable OAuth or credential-reference fields.
- Files supplied by the package must resolve inside the plugin root. Do not escape it with symlinks.

## Report when finished

State which files were added, the validation result, which clients the MCP config was exported for,
and anything left as a client extension or manual step.
