# Command Model

## Alias

- WhatsApp: only messages beginning with `@oc` are processed.
- Telegram: plain text is normalized to `@oc <text>` and slash aliases are normalized to `@oc /...`.

## Routing Rules

1. `@oc <text>` (no slash): pass-through prompt to OpenCode.
2. `@oc /<command>`: static control-plane command.

This separation keeps natural-language intent handling inside OpenCode while preserving deterministic app controls.

## Command Families

- Status: `/status`
- Path context: `/pwd`, `/cd <path>`, `/ls [path]`
- Search: `/find <pattern>`, `/grep <pattern>`
- Project context: `/projects`, `/project use <id>`
- Session control: `/session list`, `/session status [id]`, `/session use <id>`, `/session new [title]`, `/session abort <id>`
- Execution: `/run <command>`, `/shell <command>`, `/abort`
- Permission workflow: `/permission <id> <once|always|reject>`, `/allow <id>`, `/deny <id>`
- Output retrieval: `/runs`, `/get <runId>`
- Model management: `/model status`, `/model list`, `/model set <providerId> <modelId>`
- Tool management: `/tools ids`, `/tools list [providerId] [modelId]`
- MCP management: `/mcp status`, `/mcp add <name> <command>`, `/mcp connect <server>`, `/mcp disconnect <server>`
- Skills/agents: `/skills list`
- OpenCode diagnostics: `/opencode status`, `/opencode providers`, `/opencode commands`, `/opencode diagnostics`
- Access admin: `/users list`, `/users add <number>`, `/users remove <number>`, `/users bindtg <telegramUserId> <number> [username]`, `/users unbindtg <telegramUserId>`, `/users tglist`, `/lock`, `/unlock`

## Safety and Confirmation

- Dangerous tiers (`run`, `shell`, `session.abort`, `abort`, `model.set`, `mcp.add`, `mcp.connect`, `mcp.disconnect`) require confirmation.
- App returns a confirmation ID and requires `/confirm <id>`.
- Confirmations are single-use and TTL-limited in SQLite.

## Permission Policy Matrix

| Namespace | Examples | Owner-only | Confirmation required |
|---|---|---:|---:|
| Access admin | `/users ...`, `/lock`, `/unlock` | Yes | No |
| Session/path/status/read | `/status`, `/session list`, `/pwd`, `/ls`, `/runs` | No | No |
| Prompt | `@oc <text>` | No | No |
| Execution | `/run`, `/shell`, `/abort`, `/session abort` | No | Yes |
| Model | `/model status`, `/model list`, `/model set` | No | `set` only |
| Tools | `/tools ids`, `/tools list` | No | No |
| MCP | `/mcp status`, `/mcp add`, `/mcp connect`, `/mcp disconnect` | No | add/connect/disconnect |
| Skills | `/skills list` | No | No |
| OpenCode diagnostics | `/opencode status`, `/opencode providers`, `/opencode commands`, `/opencode diagnostics` | No | No |

## Deterministic vs Prompt-Driven Boundary

- Deterministic control-plane commands are resolved by router/executor/adapter against explicit SDK calls.
- Prompt pass-through (`@oc <text>`) remains available for open-ended agent work.
- Unknown slash commands intentionally fall back to prompt behavior to preserve usability.

## Edge Case Handling

- Duplicate inbound transport message IDs are ignored via persisted dedupe table.
- Per-user concurrency guard prevents simultaneous command overlap.
- Path traversal is blocked outside workspace root.
- Unknown slash command falls back to prompt intent.
