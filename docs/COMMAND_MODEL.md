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
- Access admin: `/users list`, `/users add <number>`, `/users remove <number>`, `/users bindtg <telegramUserId> <number> [username]`, `/users unbindtg <telegramUserId>`, `/users tglist`, `/lock`, `/unlock`

## Safety and Confirmation

- Dangerous tiers (`run`, `shell`, `session.abort`, `abort`) require confirmation.
- App returns a confirmation ID and requires `/confirm <id>`.
- Confirmations are single-use and TTL-limited in SQLite.

## Edge Case Handling

- Duplicate inbound transport message IDs are ignored via persisted dedupe table.
- Per-user concurrency guard prevents simultaneous command overlap.
- Path traversal is blocked outside workspace root.
- Unknown slash command falls back to prompt intent.
