# OpenCode Remote

OpenCode Remote is a local-first control layer for OpenCode with dual transport support:

- WhatsApp (`whatsapp-web.js`)
- Telegram (Bot API)

It routes chat input into a deterministic command model (`@oc`) and persists control-plane state in SQLite.

Implementation is TypeScript-first (`src/**/*.ts`, `tests/**/*.ts`) with zero explicit `any` usage.

## What It Does

- Natural language pass-through to OpenCode
- Slash-command control plane for sessions, paths, execution, and permissions
- Owner/allowlist access control
- Confirmation flow for dangerous actions
- Durable run retrieval (`/runs`, `/get <id>`)
- Retry + dead-letter capture for inbound transport failures

## Architecture

- OpenCode is the execution and session source of truth
- Transports: WhatsApp and Telegram
- Local state: SQLite (`users`, `bindings`, `confirmations`, `runs`, `messages`, `audit`, `dead_letters`)

Request flow:

1. Transport receives message/update
2. App builds a composite dedupe key (`channel:sender:transport_message_id`)
3. Access controller validates allowlist/role
4. Router parses `@oc` prompt or slash command
5. Safety engine enforces guardrails
6. Executor calls OpenCode adapter
7. Response returns via originating transport

## Requirements

- Node.js `>= 20`
- Local OpenCode server (`http://localhost:4096` by default)
- WhatsApp account for pairing (if WhatsApp transport enabled)
- Telegram bot token (if Telegram transport enabled)

## Quick Start

Install and set owner:

```bash
npm install
npx conf set security.ownerNumber "+15551234567"
```

Optional Telegram basics:

```bash
npx conf set telegram.botToken "<your-bot-token>"
npx conf set telegram.ownerUserId "123456789"
```

Start:

```bash
npm start
```

Then pair WhatsApp from QR (if enabled), and message your Telegram bot.

## Telegram Delivery Modes

Development (polling):

```bash
npx conf set telegram.pollingEnabled true
npx conf set telegram.webhookEnabled false
```

Production (webhook):

```bash
npx conf set telegram.webhookEnabled true
npx conf set telegram.pollingEnabled false
npx conf set telegram.webhookUrl "https://your-domain.example/telegram/webhook"
npx conf set telegram.webhookSecret "<random-secret>"
```

If both are enabled, webhook mode takes precedence and polling is skipped with a warning.

## Security Defaults

- Telegram group chats blocked by default (`telegram.allowGroupChats=false`)
- Telegram retry controls are transport-specific:
  - `telegram.messageMaxRetries`
  - `telegram.messageRetryDelayMs`
- Dangerous commands require explicit confirmation

## Command Model

- `@oc <text>`: pass-through prompt
- `@oc /<command>`: control-plane command

Telegram normalization:

- Plain text is normalized to `@oc <text>`
- Supported Telegram slash aliases are normalized to shared `@oc` commands

Common commands:

- `@oc /status`
- `@oc /session list`
- `@oc /run <command>`
- `@oc /shell <command>`
- `@oc /runs`
- `@oc /get <runId>`

Admin commands:

- `@oc /users list`
- `@oc /users add <+number>`
- `@oc /users remove <+number>`
- `@oc /users bindtg <telegramUserId> <+number> [username]`
- `@oc /users unbindtg <telegramUserId>`
- `@oc /users tglist`
- `@oc /lock`
- `@oc /unlock`

## Data and Reliability

- DB path: `./data/opencode-remote.db` (default)
- WhatsApp auth path: `./.wwebjs_auth` (default)
- Audit events: `audit` table
- Failed inbound payloads: `dead_letters` table
- Message idempotency: composite key in `messages` table

## Scripts

- `npm start`
- `npm run dev`
- `npm run lint`
- `npm run typecheck`
- `npm test`
- `npm run verify`

Recommended pre-release gate:

```bash
npm run verify
```

## Documentation

- `docs/README.md`
- `docs/ARCHITECTURE.md`
- `docs/COMMAND_MODEL.md`
- `docs/DATA_MODELS.md`
- `docs/DATABASE_SCHEMA.md`
- `docs/ERD.md`
- `docs/OPERATIONS.md`
- `CHANGELOG.md`
