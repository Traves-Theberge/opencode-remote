# Command Model

## Alias

- Prefix is optional (no prefix required).
- Slash commands (`/...`) are parsed directly.
- Plain text is treated as prompt input.

## Routing Rules

1. `<text>` (no slash): pass-through prompt to OpenCode.
2. `/<command>`: static control-plane command.

This separation keeps natural-language intent handling inside OpenCode while preserving deterministic app controls.

## Command Families

- Status: `/status`
- Path context: `/pwd`, `/cd <path>`, `/ls [path]`
- Search: `/find <pattern>`, `/grep <pattern>`
- Project context: `/projects`, `/project use <id>`
- Session control: `/session list`, `/session status [id]`, `/session use <id>`, `/session new [title]`, `/session abort <id>`
- Execution: `/abort`
- Permission workflow: `/permission <id> <once|always|reject>`, `/allow <id>`, `/deny <id>`
- Output retrieval: `/last`, `/get [runId]`
- Model management: `/model status`, `/model list` (summary), `/model list full`, `/model set <providerId> <modelId>`
- Tool management: `/tools ids`, `/tools list [providerId] [modelId]`
- MCP management: `/mcp status`, `/mcp add <name> <command>`, `/mcp connect <server>`, `/mcp disconnect <server>`
- Skills/agents: `/skills list`
- OpenCode diagnostics: `/opencode status`, `/opencode providers`, `/opencode commands`, `/opencode diagnostics`
- Access admin: `/users list`, `/users add <number>`, `/users remove <number>`, `/users bindtg <telegramUserId> <number> [username]`, `/users unbindtg <telegramUserId>`, `/users tglist`, `/lock`, `/unlock`

## Safety and Confirmation

- Dangerous tiers (`run`, `shell`, `session.abort`, `abort`, `model.set`, `mcp.add`, `mcp.connect`, `mcp.disconnect`) require confirmation.
- App returns a confirmation ID and requires `/confirm <id>`.
- Confirmations are single-use and TTL-limited in SQLite.
- Owner-only policy denials for mutating advanced namespaces are audited as `command.blocked` with reason `owner_only_policy`.

## Permission Policy Matrix

| Namespace | Examples | Owner-only | Confirmation required |
|---|---|---:|---:|
| Access admin | `/users ...`, `/lock`, `/unlock` | Yes | No |
| Session/path/status/read | `/status`, `/session list`, `/pwd`, `/ls`, `/last`, `/get` | No | No |
| Prompt | `<text>` | No | No |
| Execution | `/abort`, `/session abort` | No | Yes |
| Model | `/model status`, `/model list`, `/model set` | `set` only | `set` only |
| Tools | `/tools ids`, `/tools list` | No | No |
| MCP | `/mcp status`, `/mcp add`, `/mcp connect`, `/mcp disconnect` | add/connect/disconnect | add/connect/disconnect |
| Skills | `/skills list` | No | No |
| OpenCode diagnostics | `/opencode status`, `/opencode providers`, `/opencode commands`, `/opencode diagnostics` | No | No |

## Deterministic vs Prompt-Driven Boundary

- Deterministic control-plane commands are resolved by router/executor/adapter against explicit SDK calls.
- Prompt pass-through (`<text>`) remains available for open-ended agent work.
- Unknown slash commands intentionally fall back to prompt behavior to preserve usability.

## Edge Case Handling

- Duplicate inbound transport message IDs are ignored via persisted dedupe table.
- Per-user concurrency guard prevents simultaneous command overlap.
- Path traversal is blocked outside workspace root.
- Unknown slash command falls back to prompt intent.

## Telegram Media Inputs

- Voice/audio messages are transcribed locally (Transformers ASR) and routed as prompt text.
- Image/photo messages are attached to prompt calls as file parts.
- Image messages without caption use a default prompt: `Please analyze this image.`
