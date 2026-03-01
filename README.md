# OpenCode Remote

![Version](https://img.shields.io/badge/version-1.1.0-blue)
![Node](https://img.shields.io/badge/node-%3E%3D20-339933)
![Storage](https://img.shields.io/badge/storage-SQLite-003B57)
![Tests](https://img.shields.io/badge/tests-25%20passing-brightgreen)

Local-first remote control for OpenCode through WhatsApp and Telegram.

`@oc` messages are routed to your local OpenCode session, while slash commands provide deterministic control-plane operations (session/path/admin/safety). Telegram also supports direct text and native slash command aliases.

## Highlights

- OpenCode-first routing: natural language goes directly to OpenCode (`@oc ...`)
- Deterministic control plane: slash commands (`@oc /...`)
- Durable local state via SQLite (allowlist, bindings, confirms, runs, dedupe)
- Permission workflow over WhatsApp and Telegram (`/allow`, `/deny`, `/permission`)
- Safety guardrails for dangerous operations and command confirmations
- Run ID retrieval for long outputs (`/runs`, `/get <id>`)
- Telegram inline keyboard shortcuts for common actions (`Status`, `Sessions`, `Diff`, `Runs`, `Abort`, `Help`)

## Architecture At A Glance

- OpenCode is the source of truth for coding sessions and tool execution.
- WhatsApp (`whatsapp-web.js`) and Telegram (Bot API) are transport/UI.
- SQLite is the local control-plane state store.

Flow:

1. WhatsApp or Telegram receives a message
2. App checks idempotency + allowlist
3. Router resolves pass-through prompt vs slash command
4. Safety policy runs
5. Executor calls OpenCode SDK with session/cwd context
6. Output is formatted and returned to the originating channel
7. Metadata is persisted to SQLite audit and dead-letter tables

## Requirements

- Node.js `>= 20`
- A running local OpenCode server (default `http://localhost:4096`)
- WhatsApp account for QR pairing (through WhatsApp Web session)
- Telegram bot token (for Telegram transport)

## Quick Start

1. Install dependencies:

```bash
npm install
```

2. Set owner phone number (E.164):

```bash
npx conf set security.ownerNumber "+15551234567"
```

3. Start OpenCode server (if not already running).

4. Start this app:

```bash
npm start
```

5. Scan the QR in terminal with WhatsApp.

### Telegram Setup

1. Create a bot with BotFather and copy the token.
2. Set token:

```bash
npx conf set telegram.botToken "<your-bot-token>"
```

3. (Optional) Bind owner Telegram user ID for immediate owner access:

```bash
npx conf set telegram.ownerUserId "123456789"
```

4. For production webhook mode:

```bash
npx conf set telegram.webhookEnabled true
npx conf set telegram.webhookUrl "https://your-domain.example/telegram/webhook"
npx conf set telegram.webhookSecret "<random-secret>"
```

5. For dev polling mode, keep:

```bash
npx conf set telegram.pollingEnabled true
```

## Routing Model

- `@oc <text>`: pass-through prompt to OpenCode.
- `@oc /<command>`: control-plane command.
- Telegram plain text also maps to `@oc <text>` automatically.
- Telegram slash aliases are normalized to the same control commands.

Examples:

- `@oc review staged changes and propose a commit message`
- `@oc /status`
- `@oc /session list`

## Command Reference

### Core

- `@oc /status`
- `@oc /help`

### Path and Search

- `@oc /pwd`
- `@oc /cd <path>`
- `@oc /ls [path]`
- `@oc /find <pattern>`
- `@oc /grep <pattern>`

### Project and Session

- `@oc /projects`
- `@oc /project use <id>`
- `@oc /session list`
- `@oc /session status [id]`
- `@oc /session use <id>`
- `@oc /session new [title]`
- `@oc /session abort <id>`
- `@oc /diff [sessionId]`
- `@oc /summarize [sessionId]`

### Execution

- `@oc /run <command>`
- `@oc /shell <command>`
- `@oc /abort`

### Safety and Permissions

- `@oc /confirm <id>`
- `@oc /permission <permissionId> <once|always|reject>`
- `@oc /allow <permissionId>`
- `@oc /deny <permissionId>`

### Output Retrieval

- `@oc /runs`
- `@oc /get <runId>`

### Admin

- `@oc /users list`
- `@oc /users add <+number>`
- `@oc /users remove <+number>`
- `@oc /users bindtg <telegramUserId> <+number> [username]`
- `@oc /users unbindtg <telegramUserId>`
- `@oc /users tglist`
- `@oc /lock`
- `@oc /unlock`

## Storage and Data

- SQLite path defaults to `./data/opencode-remote.db` (`storage.dbPath`).
- WhatsApp auth data defaults to `./.wwebjs_auth`.
- Audit trail is persisted in SQLite `audit` table.
- Failed inbound update payloads are persisted in SQLite `dead_letters` table.
- Schema migrations are tracked in `schema_migrations`.

## Reliability and Safety

- Inbound message dedupe via `messages.message_id` across channels.
- Confirmation TTL and single-use enforcement via `confirmations`.
- Per-user session and path bindings persisted in `bindings`.
- Dangerous command deny patterns in safety engine.
- Path traversal prevented outside workspace root.
- Inbound retries and dead-letter capture for transport failures.

## Scripts

- `npm start` - run app
- `npm run dev` - run with file watch
- `npm run build` - run build pipeline (typecheck)
- `npm run lint` - run ESLint on source and tests
- `npm run typecheck` - run TypeScript no-emit checks
- `npm test` - run tests
- `npm run verify` - run lint + typecheck + tests with structured logging

## Quality Gates

Recommended pre-release verification:

```bash
npm run verify
```

## Documentation
| Document | Purpose |
|---|---|
| `docs/README.md` | Documentation index |
| `docs/ARCHITECTURE.md` | End-to-end architecture and flow |
| `docs/COMMAND_MODEL.md` | Command semantics and routing rules |
| `docs/DATA_MODELS.md` | Runtime and persistence model definitions |
| `docs/DATABASE_SCHEMA.md` | Full SQLite schema and migration details |
| `docs/ERD.md` | Entity-relationship diagram |
| `docs/OPERATIONS.md` | Runbook, troubleshooting, and backup/restore |
| `docs/plans/2026-03-01-telegram-dual-channel-design.md` | Telegram dual-channel architecture design |
| `docs/plans/2026-03-01-telegram-dual-channel-implementation-plan.md` | Telegram implementation roadmap |
| `CHANGELOG.md` | Release history |
| `RELEASE_NOTES_v1.1.0.md` | Current release rollout notes |

## Status

Current implementation is a production-oriented local-first V1.1 baseline with SQLite-backed control plane, durable command state, and comprehensive operator docs.
