# Onboarding Guide

This guide covers first-time setup using the new CLI/TUI management flows.

## Prerequisites

- Node.js `>= 20`
- Bun `>= 1.3` (for TUI)
- OpenCode server running locally (`http://localhost:4096` default)

## Path A: CLI Wizard (Recommended)

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
