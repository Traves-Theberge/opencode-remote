# OpenCode Remote

![Image 1](./opencode-remote.png)

OpenCode Remote is a Telegram-operated control plane for a local OpenCode runtime.
It gives you a reliable chat interface for prompting, command execution, session control, safety confirmations, and operator visibility.

## What It Is

- Remote access is handled through Telegram.
- OpenCode remains the execution engine and session authority.
- OpenCode Remote adds routing, policy enforcement, persistence, retries, and operator tooling.
- SQLite stores control-plane state (`users`, `bindings`, `confirmations`, `runs`, `messages`, `audit`, `dead_letters`).

## Core Capabilities

- Natural-language prompts routed to OpenCode sessions.
- Deterministic slash-command model for control-plane actions.
- Owner + allowlist access control with Telegram identity binding.
- Confirmation workflow for dangerous operations.
- Inbound dedupe and outbound retry protections.
- Stores failed message processing attempts for debugging.
- Local voice transcription and image/PDF prompt attachment pipeline.

## High-Level Request Flow

1. Telegram update arrives.
2. Runtime computes idempotency key (`channel:sender:transport_message_id`).
3. Access control evaluates identity and role.
4. Router resolves slash command vs prompt intent.
5. Safety engine enforces command policy/confirmation rules.
6. Executor runs command path or OpenCode adapter call.
7. Response is delivered back to Telegram and recorded in persistence/audit.

## Requirements

- Node.js `>= 20`
- OpenCode server reachable at `http://127.0.0.1:4096` (default)
- Telegram bot token
- Telegram owner user ID

## Quick Start (Local)

Start OpenCode first:

```bash
opencode serve --hostname 127.0.0.1 --port 4096
```

In a second terminal:

```bash
npm install
npm run cli -- setup
npm start
```

Then send messages to your bot in Telegram.

## Docker Workflow

1. Start OpenCode on host:

```bash
opencode serve --hostname 127.0.0.1 --port 4096
```

2. Create docker env file:

```bash
cp .env.docker.example .env
```

3. Fill required values in `.env`.

4. Build/redeploy:

```bash
npm run docker:redeploy
docker compose logs -f remote
```

Optional: install local automation hooks:

```bash
npm run hooks:install
```

This installs:

- `post-commit` background redeploy (with configurable delay and Telegram notices)
- `pre-push` guard for secrets/database artifacts

## Telegram Modes

Development polling:

```bash
npx conf set telegram.pollingEnabled true
npx conf set telegram.webhookEnabled false
```

Production webhook:

```bash
npx conf set telegram.webhookEnabled true
npx conf set telegram.pollingEnabled false
npx conf set telegram.webhookUrl "https://your-domain.example/telegram/webhook"
npx conf set telegram.webhookSecret "<random-secret>"
```

If both are enabled, webhook mode wins and polling is skipped with warning.

## Command Model

- Plain text -> prompt intent
- Slash command -> control-plane intent
- Unknown slash commands -> deterministic error (no prompt fallback)

| Category | Command | Description |
| --- | --- | --- |
| Common | `/help` | Show available commands and usage hints. |
| Common | `/status` | Show runtime health and active context. |
| Common | `/session list` | List available OpenCode sessions. |
| Common | `/last` | Show the most recent stored run output. |
| Common | `/abort` | Stop the active run/session operation. |
| Admin | `/users list` | List allowlisted users. |
| Admin | `/users add <+number>` | Add a phone number to the allowlist. |
| Admin | `/users remove <+number>` | Remove a phone number from the allowlist. |
| Admin | `/users bindtg <telegramUserId> <+number> [username]` | Bind a Telegram user to an allowlisted phone number. |
| Admin | `/users unbindtg <telegramUserId>` | Remove an existing Telegram user binding. |
| Admin | `/users tglist` | List active Telegram identity bindings. |
| Admin | `/lock` | Lock command execution for non-owner sessions. |
| Admin | `/unlock` | Unlock command execution after a lock event. |
| Advanced | `/model ...` | Inspect and update model/provider configuration. |
| Advanced | `/tools ...` | Inspect tool ids and tool availability. |
| Advanced | `/mcp ...` | Manage MCP server registration and connectivity. |
| Advanced | `/skills ...` | List available skills exposed by OpenCode. |
| Advanced | `/opencode ...` | Run OpenCode diagnostics and capability queries. |

See `docs/COMMAND_MODEL.md` for policy and permission detail.

## Environment Overrides

Config keys can be overridden with uppercase env vars.

```bash
OPENCODE_SERVER_URL=http://127.0.0.1:4096
TELEGRAM_ENABLED=true
TELEGRAM_BOT_TOKEN=replace-with-real-token
TELEGRAM_OWNER_USER_ID=123456789
SECURITY_OWNER_NUMBER=+15551234567
STORAGE_DB_PATH=./data/opencode-remote.db
OPENCODE_REMOTE_BUILD_ID=local-dev
```

Important notes:

- `TELEGRAM_OWNER_USER_ID` auto-binds owner access at startup.
- Telegram polling supports one active consumer per bot token.
- `SECURITY_REQUIRE_ENV_TOKENS=true` enforces env-only secret loading.

Media/ASR toggles:

- `MEDIA_ENABLED=true`
- `MEDIA_VOICE_ENABLED=true`
- `MEDIA_IMAGE_ENABLED=true`
- `ASR_ENABLED=true`
- `ASR_MODEL=Xenova/whisper-small`

Vision behavior:

- Image/PDF prompts request a per-call model override: `openai/gpt-5.3-codex`.
- If account/model support fails with the known Codex error, one retry is attempted with `opencode/big-pickle`.

## Operations and Reliability

- Ingress rate limiting enabled by default.
- Group chats blocked by default (`telegram.allowGroupChats=false`).
- Confirmation requirement enforced for dangerous actions.
- Audit logs and failed-message records are redacted before persistence.
- Local DB artifacts remain git-ignored (`data/`, `*.db`, `*.sqlite*`).

## Monorepo Layout

- `src/` core runtime modules (router, executor, adapter, transport)
- `apps/daemon/` daemon entrypoint
- `apps/cli/` operator setup and maintenance interface
- `packages/bridge/` shared ops/config/db task bridge
- `tests/` integration and behavior tests

## Scripts

- `npm start`
- `npm run dev`
- `npm run cli -- <command>`
- `npm run docker:redeploy`
- `npm run hooks:install`
- `npm run lint`
- `npm run typecheck`
- `npm test`
- `npm run typecheck:workspaces`
- `npm run test:workspaces`
- `npm run verify`

Recommended gate before release:

```bash
npm run verify
```

`verify` runs lint, docs checks, typechecks, tests, and workspace smoke checks.
