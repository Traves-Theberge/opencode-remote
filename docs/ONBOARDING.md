# Onboarding Guide

This guide covers first-time setup using the new CLI/TUI management flows.

## Prerequisites

- Node.js `>= 20`
- Bun `>= 1.3` (for TUI)
- OpenCode server running locally (`http://localhost:4096` default)

## Path A: CLI Wizard (Recommended)

Start OpenCode server first (required):

```bash
opencode serve --hostname 127.0.0.1 --port 4096
```

Keep that terminal running, then continue below in another terminal.

Bootstrap from curl:

```bash
curl -fsSL https://raw.githubusercontent.com/Traves-Theberge/opencode-remote/master/scripts/install.sh | bash
cd ~/opencode-remote
```

Run:

```bash
npm run cli -- setup
```

Wizard prompts:

1. Owner number (E.164)
2. Telegram enable/disable
3. Telegram bot token
4. Telegram mode (`polling` or `webhook`)
5. Webhook URL/secret (if webhook mode selected)

Then start daemon:

```bash
npm start
```

## Path A2: Docker (Lightweight)

Docker mode is optimized for Telegram-first operation and keeps WhatsApp disabled by default.

1) Start OpenCode server on host:

```bash
opencode serve --hostname 127.0.0.1 --port 4096
```

2) Prepare env:

```bash
cp .env.docker.example .env
```

3) Edit `.env` values:

- `SECURITY_OWNER_NUMBER=+15551234567`
- `TELEGRAM_BOT_TOKEN=<your-token>`
- `TELEGRAM_OWNER_USER_ID=<your-telegram-user-id>`

4) Start container:

```bash
npm run docker:redeploy
docker compose logs -f remote
```

Webhook-first production startup:

```bash
docker compose -f docker-compose.yml -f docker-compose.webhook.yml up -d --build
```

Set these env values for webhook mode:

- `TELEGRAM_WEBHOOK_URL=https://your-domain.example/telegram/webhook`
- `TELEGRAM_WEBHOOK_SECRET=<random-secret>`

Optional hardening for production:

- `SECURITY_REQUIRE_ENV_TOKENS=true` (reject persisted plaintext token/secret config)

Optional: run the interactive wizard inside container instead of env-only setup:

```bash
docker compose run --rm remote npm run cli -- setup
```

Important polling rule:

- One Telegram bot token supports one active polling consumer. If you see `getUpdates 409`, stop all other pollers or rotate token.

Token posture check:

```bash
npm run cli -- security rotate-token-check
```

## Path B: TUI Flow

Run:

```bash
npm run tui
```

Current behavior:

- TUI shows onboarding-required state if owner is not configured.
- TUI shows management dashboard summary (owner, db path, telegram mode, table counts).
- TUI includes flow visualizer and transition tracker from recent audit events.
- Use CLI wizard for step-by-step configuration input while TUI onboarding controls are expanded.

## Post-setup Validation

Check status:

```bash
npm run cli -- status
```

Check logs:

```bash
npm run cli -- logs 20
```

Check dead letters:

```bash
npm run cli -- deadletters 20
```

## Maintenance Quick Commands

- `npm run cli -- db info`
- `npm run cli -- db vacuum`
- `npm run cli -- db prune dead_letters 30`
- `npm run cli -- security rotate-token-check`
