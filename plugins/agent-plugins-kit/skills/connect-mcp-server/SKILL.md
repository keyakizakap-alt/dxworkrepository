---
name: connect-mcp-server
description: Wire an app, API, or service into AI agents once as a portable MCP server and roll it out to Claude Code, VS Code, Cursor, and Codex from a single config. Use when connecting a new tool or data source to agents, when the same MCP server has to work in several clients, or when MCP config has drifted between clients.
license: MIT
metadata:
  version: "1.0.0"
---

# Connect an MCP server portably

Define a connection once in a portable `mcp.json`, then generate each client's native config from
it. This removes the usual failure mode where the same server is configured four times, in four
formats, and drifts apart.

## Decide where the config belongs

| Situation | Where it goes |
| --- | --- |
| The server is part of a plugin you ship | That plugin's root `mcp.json` |
| The server is shared infrastructure for this repository | A dedicated plugin, e.g. `plugins/<team>-mcp/mcp.json` |
| The server needs credentials | Still declare it here; supply the credentials through the client, never in the file |

## Workflow

1. **Identify the transport.** `stdio` for a local subprocess, `streamable-http` for a current
   remote server, `sse` only for a legacy endpoint. The declared transport is used for the first
   connection attempt and there is no defined fallback, so confirm what the server actually speaks.

2. **Add the entry to `mcp.json`.** Keep the top level closed — only `$schema` and `mcpServers`.

   ```json
   {
     "$schema": "https://agent-plugins.org/schemas/1.0.0/mcp.schema.json",
     "mcpServers": {
       "docs-search": {
         "type": "streamable-http",
         "url": "https://mcp.example.com/mcp"
       },
       "local-indexer": {
         "type": "stdio",
         "command": "./bin/indexer",
         "args": ["--store", "${PLUGIN_DATA}/index"],
         "env": { "CONFIG": "${PLUGIN_ROOT}/indexer.toml" }
       }
     }
   }
   ```

   `command` is a single executable token — a bare name or a `./`-prefixed plugin-relative path.
   Placeholders are not expanded in it. Read-only packaged files live under `${PLUGIN_ROOT}`;
   anything written at runtime belongs under `${PLUGIN_DATA}`, which survives plugin updates.

3. **Keep credentials out.** Headers are literal, visible package data. Agent Plugins v1.0.0 defines
   no portable OAuth or credential-reference fields, so authentication stays client-managed: use
   `/mcp` in Claude Code, input variables in VS Code, or the client's own credential store. If the
   validator warns that a header looks like a credential, it is telling you the secret would be
   committed.

4. **Validate.**

   ```bash
   python3 plugins/agent-plugins-kit/scripts/ap_validate.py plugins/<name>
   ```

5. **Preview the generated configs, then write them.**

   ```bash
   python3 plugins/agent-plugins-kit/scripts/ap_export.py --plugin plugins/<name> --client all
   python3 plugins/agent-plugins-kit/scripts/ap_export.py --plugin plugins/<name> --client all --write
   ```

   | Client | File | Shape |
   | --- | --- | --- |
   | `claude-code` | `.mcp.json` | `mcpServers`, remote transport named `http` |
   | `vscode` | `.vscode/mcp.json` | `servers` |
   | `cursor` | `.cursor/mcp.json` | `mcpServers` |
   | `codex` | `.codex/config.toml` | `[mcp_servers.<name>]` TOML fragment to merge into `~/.codex/config.toml` |

   Generated files are derived artifacts. Edit `mcp.json` and re-export; never hand-edit the output.

6. **Confirm the server actually connects** in at least one client before reporting success. In
   Claude Code, restart the session and check `/mcp`.

## Failure isolation

An invalid top-level `mcp.json` disables MCP for the entire plugin. An invalid or unavailable single
server disables only that entry — other servers and all skills keep loading. So a broken new server
degrades one connection, not the whole environment.

## Report when finished

Name the server and transport added, the validation result, which client configs were generated, how
credentials are supplied, and the result of the live connection check.
