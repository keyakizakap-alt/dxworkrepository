# Portable MCP configuration

Reference for writing root `mcp.json` under Agent Plugins v1.0.0. The
[Model Context Protocol specification](https://modelcontextprotocol.io/specification) remains
authoritative for MCP wire behavior and lifecycle; Agent Plugins only defines the config shape.

## Document shape

The top level is closed — exactly `$schema` and `mcpServers`, nothing else.

```json
{
  "$schema": "https://agent-plugins.org/schemas/1.0.0/mcp.schema.json",
  "mcpServers": {
    "validator": {
      "type": "stdio",
      "command": "./bin/validator",
      "args": ["--data", "${PLUGIN_DATA}/validator"],
      "env": { "CONFIG": "${PLUGIN_ROOT}/config.json" },
      "cwd": "${PLUGIN_ROOT}"
    },
    "deployment-api": {
      "type": "streamable-http",
      "url": "https://deploy.example.com/mcp",
      "headers": { "X-Tenant": "public-tenant" }
    }
  }
}
```

## Transports

| Type | Required | Optional | Notes |
| --- | --- | --- | --- |
| `stdio` | `type`, `command` | `args`, `env`, `cwd` | Local subprocess. |
| `streamable-http` | `type`, `url` | `headers` | Current remote transport. |
| `sse` | `type`, `url` | `headers` | Deprecated HTTP+SSE. Client support is optional. |

A conformant MCP-capable client supports at least one of `stdio` and `streamable-http`, and should
support both. The declared transport is used for the initial connection attempt; the specification
defines no fallback if that attempt fails, so pick the transport the server actually speaks.

## stdio commands and paths

`command` is **one executable token**, not a shell command line. It is either a bare executable name
resolved by platform search rules, or a plugin-relative path beginning with `./`. Placeholder
expansion does not apply to `command`, so `"${PLUGIN_ROOT}/bin/server"` is invalid — write
`"./bin/server"`.

`cwd` defaults to the plugin root. An explicit `cwd` is plugin-relative (`./…`), `${PLUGIN_ROOT}`-rooted,
or `${PLUGIN_DATA}`-rooted, and must stay inside the corresponding directory.

## Plugin variables

Clients provide two environment variables to stdio subprocesses:

- `PLUGIN_ROOT` — the absolute, filesystem-resolved plugin root.
- `PLUGIN_DATA` — a dedicated writable directory that persists across plugin updates.

Both placeholders are expanded in `args`, `env` values, and `cwd`. Expansion is textual, single-pass,
and non-recursive. It does **not** apply to environment variable *keys*, to `command`, to remote
URLs, or to HTTP headers. A plugin cannot override either reserved variable via `env`.

Use `${PLUGIN_ROOT}` for packaged read-only resources and `${PLUGIN_DATA}` for anything the server
writes. Writing inside `${PLUGIN_ROOT}` risks losing data on update.

## Remote connections

Remote URLs are absolute HTTP or HTTPS URLs with no user information and no fragment. Non-loopback
endpoints must use HTTPS. Headers are literal, visible package data and must not carry credentials
or secrets.

Agent Plugins v1.0.0 defines no portable OAuth or credential-reference fields — **authentication is
client-managed**. Configure tokens through the client's own credential mechanism (Claude Code's
`/mcp` auth flow, VS Code input variables, and so on), never in the committed `mcp.json`.

## Failure isolation

- An invalid top-level `mcp.json` disables MCP for the whole plugin.
- An invalid or unavailable individual server disables only that entry.
- Skills and client extensions keep loading in both cases.

## Exporting to clients

`mcp.json` is the source of truth. Generate client-native configs rather than maintaining copies:

```bash
python3 plugins/agent-plugins-kit/scripts/ap_export.py --plugin plugins/<name> --client all
python3 plugins/agent-plugins-kit/scripts/ap_export.py --plugin plugins/<name> --client all --write
```

The exporter resolves `./`-relative commands to absolute paths, expands both placeholders, and
passes `PLUGIN_ROOT`/`PLUGIN_DATA` through `env` — clients that are not Agent Plugins clients do not
supply them on their own.
