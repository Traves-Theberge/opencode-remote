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
- Bun `>= 1.3` (for TUI app)
- Local OpenCode server (`http://localhost:4096` by default)
- WhatsApp account for pairing (if WhatsApp transport enabled)
- Telegram bot token (if Telegram transport enabled)

## Quick Start

Install from curl (fresh machine):

```bash
curl -fsSL https://raw.githubusercontent.com/Traves-Theberge/opencode-remote/master/scripts/install.sh | bash
```

Then:

```bash
cd ~/opencode-remote
npm run cli -- setup
npm start
```

Manual local setup:

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

## Monorepo Layout

- `apps/daemon/` - workspace-native daemon entrypoint
- `src/` - core daemon modules (router/executor/adapter/transports)
- `apps/cli/` - onboarding and maintenance CLI
- `apps/tui/` - visual operator TUI (OpenTUI)
- `packages/bridge/` - shared management bridge for config/db/log operations

## Visual Operations (TUI)

Run:

```bash
npm run tui
```

Current TUI includes:

- runtime summary (owner, transport mode, db counters)
- flow visualizer for message stages from recent audit events
- transition tracking (`incoming -> executed`, `incoming -> blocked`, etc.)
- latest timeline for recent message/command events
- pane-based navigation (Overview, Flow, Tasks, Output)
- keyboard task execution and output/timeline paging

## Onboarding Flows

CLI wizard:

```bash
npm run cli -- setup
```

Validate without persisting:

```bash
npm run cli -- setup --dry-run
```

TUI manager:

```bash
npm run tui
```

The TUI currently provides an onboarding state view and management dashboard shell, while the CLI handles interactive setup and maintenance commands.

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

Advanced control-plane namespaces:

- `@oc /model status`
- `@oc /model list`
- `@oc /model set <providerId> <modelId>`
- `@oc /tools ids`
- `@oc /tools list [providerId] [modelId]`
- `@oc /mcp status`
- `@oc /mcp add <name> <command>`
- `@oc /mcp connect <server>`
- `@oc /mcp disconnect <server>`
- `@oc /skills list`
- `@oc /opencode status`
- `@oc /opencode providers`
- `@oc /opencode commands`
- `@oc /opencode diagnostics`

Permission/safety policy matrix is documented in `docs/COMMAND_MODEL.md`.

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

Persistence safety:

- local database files are ignored by git (`data/`, `*.db`, `*.sqlite*`)
- repo stays code-only; operators bootstrap runtime state locally

## Scripts

- `npm start`
- `npm run dev`
- `npm run cli -- <command>`
- `npm run tui`
- `npm run lint`
- `npm run typecheck`
- `npm test`
- `npm run typecheck:workspaces`
- `npm run test:workspaces`
- `npm run verify`

Recommended pre-release gate:

```bash
npm run verify
```

`verify` now includes:

- TypeScript lint on `src/`, `tests/`, `apps/`, and `packages/`
- root typecheck
- workspace typecheck
- full tests
- workspace smoke command

## Documentation

- `docs/README.md`
- `docs/ARCHITECTURE.md`
- `docs/COMMAND_MODEL.md`
- `docs/DATA_MODELS.md`
- `docs/DATABASE_SCHEMA.md`
- `docs/ERD.md`
- `docs/OPERATIONS.md`
- `docs/ONBOARDING.md`
- `docs/plans/2026-03-01-control-plane-parity-phase2-plan.md`
- `CHANGELOG.md`
