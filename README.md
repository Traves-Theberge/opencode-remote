# OpenCode Remote

OpenCode Remote is a local-first control layer for OpenCode with dual transport support:

- WhatsApp (`whatsapp-web.js`)
- Telegram (Bot API)

It routes chat input into a deterministic command model (slash commands + natural language) and persists control-plane state in SQLite.

Implementation is TypeScript-first (`src/**/*.ts`, `tests/**/*.ts`) with strict mode enabled and zero explicit `any` usage.

## What It Does

- Natural language pass-through to OpenCode
- Slash-command control plane for sessions, paths, execution, and permissions
- Owner/allowlist access control
- Confirmation flow for dangerous actions
- Durable run retrieval (`/last`, `/get [runId]`)
- Voice note transcription (local Transformers ASR)
- Image attachment pass-through to OpenCode prompt sessions
- Retry + dead-letter capture for inbound transport failures

## Architecture

- OpenCode is the execution and session source of truth
- Transports: WhatsApp and Telegram
- Local state: SQLite (`users`, `bindings`, `confirmations`, `runs`, `messages`, `audit`, `dead_letters`)

Request flow:

1. Transport receives message/update
2. App builds a composite dedupe key (`channel:sender:transport_message_id`)
3. Access controller validates allowlist/role
4. Router parses prompt or slash command
5. Safety engine enforces guardrails
6. Executor calls OpenCode adapter
7. Response returns via originating transport

## Requirements

- Node.js `>= 20`
- Bun `>= 1.3` (for TUI app)
- Local OpenCode server (`http://localhost:4096` by default)
- WhatsApp account for pairing (if WhatsApp transport enabled)
- Telegram bot token (if Telegram transport enabled)
- Python 3 with `transformers` installed for voice transcription

## Quick Start

### Local (recommended)

Start OpenCode server first (required):

```bash
opencode serve --hostname 127.0.0.1 --port 4096
```

In a second terminal, install and run setup:

```bash
npm install
npm run asr:install
npm run cli -- setup
npm start
```

### Docker (lightweight, Telegram-first)

The Docker image is optimized for lightweight operation and disables WhatsApp by default.

1) Start OpenCode server on the host:

```bash
opencode serve --hostname 127.0.0.1 --port 4096
```

2) Configure docker env:

```bash
cp .env.docker.example .env
```

3) Edit `.env` with your owner number and Telegram bot token.

4) Start:

```bash
npm run docker:redeploy
docker compose logs -f remote
```

This redeploy command forces a no-cache image build and container recreate so Docker always runs the latest source changes.
It also stamps each build with `OPENCODE_REMOTE_BUILD_ID` (git short SHA + timestamp by default) for runtime fingerprint verification.

Install optional auto-redeploy on commit:

```bash
npm run hooks:install
```

This installs a local git `post-commit` hook that starts `npm run docker:redeploy` in the background after each commit.

Webhook-first production profile:

```bash
docker compose -f docker-compose.yml -f docker-compose.webhook.yml up -d --build
```

Token hygiene:

- If a token is exposed, rotate it in `@BotFather` and update `.env`.
- Polling with one bot token supports one active consumer.
- Run posture check: `npm run cli -- security rotate-token-check`
- Polling conflict alerts are cooldown-limited to avoid repeated spam during recovery windows.

Install from curl (fresh local machine):

```bash
curl -fsSL https://raw.githubusercontent.com/Traves-Theberge/opencode-remote/master/scripts/install.sh | bash
```

Then:

```bash
cd ~/opencode-remote
npm run asr:install
npm run cli -- setup
npm start
```

Manual local setup:

Install and set owner:

```bash
npm install
npm run asr:install
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

## Environment Overrides

Config values can be overridden with environment variables using uppercase key names.

Examples:

```bash
OPENCODE_SERVER_URL=http://127.0.0.1:4096
WHATSAPP_ENABLED=false
TELEGRAM_ENABLED=true
TELEGRAM_BOT_TOKEN=replace-with-real-token
TELEGRAM_OWNER_USER_ID=123456789
SECURITY_OWNER_NUMBER=+15551234567
STORAGE_DB_PATH=./data/opencode-remote.db
OPENCODE_REMOTE_BUILD_ID=local-dev
```

Notes:

- `TELEGRAM_OWNER_USER_ID` auto-binds owner access on startup.
- Telegram polling supports one active consumer per bot token. Use a single running instance for a token.
- Set `SECURITY_REQUIRE_ENV_TOKENS=true` to force env-only secret loading and reject persisted plaintext token config.
- Media toggles:
  - `MEDIA_ENABLED=true`
  - `MEDIA_VOICE_ENABLED=true`
  - `MEDIA_IMAGE_ENABLED=true`
- Local ASR toggles:
  - `ASR_ENABLED=true`
  - `ASR_MODEL=openai/whisper-medium`
  - `ASR_PYTHON_BIN=python3`

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

When polling is used, OpenCode Remote reports polling conflict backoff in `/status` to make collisions visible.

## Security Defaults

- Telegram group chats blocked by default (`telegram.allowGroupChats=false`)
- Telegram retry controls are transport-specific:
  - `telegram.messageMaxRetries`
  - `telegram.messageRetryDelayMs`
- Ingress rate limiting enabled with token-bucket controls:
  - `security.ingressPerSenderPerMinute`
  - `security.ingressGlobalPerMinute`
  - `security.ingressBurst`
- Dangerous commands require explicit confirmation

## Command Model

- `<text>`: pass-through prompt
- `/<command>`: control-plane command

Telegram normalization:

- Plain text shorthand is normalized to slash commands where available (`status`, `help`, `last`, `sessions`, ...)
- Other plain text is treated as prompt input

Common commands:

- `/status`
- `/session list`
- `/abort`
- `/last`
- `/get [runId]`

Media usage:

- Send a Telegram voice note -> transcribed locally -> forwarded as prompt text.
- Send a Telegram image/photo -> attached to prompt in the active session.
- Add a caption to image messages to steer analysis; no caption defaults to `Please analyze this image.`

Advanced control-plane namespaces:

- `/model status`
- `/model list` (compact summary)
- `/model list full` (full provider JSON; large)
- `/model set <providerId> <modelId>`
- `/tools ids`
- `/tools list [providerId] [modelId]`
- `/mcp status`
- `/mcp add <name> <command>`
- `/mcp connect <server>`
- `/mcp disconnect <server>`
- `/skills list`
- `/opencode status`
- `/opencode providers`
- `/opencode commands`
- `/opencode diagnostics`

Permission/safety policy matrix is documented in `docs/COMMAND_MODEL.md`.

Admin commands:

- `/users list`
- `/users add <+number>`
- `/users remove <+number>`
- `/users bindtg <telegramUserId> <+number> [username]`
- `/users unbindtg <telegramUserId>`
- `/users tglist`
- `/lock`
- `/unlock`

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
- `npm run docker:redeploy`
- `npm run hooks:install`
- `npm run asr:install`
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
- docs index/link path check (`npm run docs:check`)
- root typecheck
- workspace typecheck
- full tests
- workspace smoke command

## Documentation

- `docs/README.md`
- `docs/architecture/` (diagram set)
- `docs/wiki/Home.md`
- `docs/ARCHITECTURE.md`
- `docs/COMMAND_MODEL.md`
- `docs/DATA_MODELS.md`
- `docs/DATABASE_SCHEMA.md`
- `docs/ERD.md`
- `docs/OPERATIONS.md`
- `docs/ONBOARDING.md`
- `CHANGELOG.md`
- `TOFIX.md`
