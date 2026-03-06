# Operations Guide

## Runtime Paths

- SQLite DB: `storage.dbPath` (default `./data/opencode-remote.db`)
- Audit events: SQLite `audit` table
- Dead letters: SQLite `dead_letters` table
- WhatsApp local auth: `./.wwebjs_auth`
- Media temp files: `media.tempPath` (default `./data/media`)

## Start and Stop

Start:

```bash
npm start
```

Dev mode:

```bash
npm run dev
```

Daemon runs through workspace entrypoint `apps/daemon/src/index.ts`.

Graceful stop:

- `Ctrl+C` or `SIGTERM`
- App closes enabled transports (WhatsApp and/or Telegram) and event stream subscription before exit

## Management Surfaces

CLI (wizard + maintenance):

```bash
npm run cli -- help
```

TUI (visual manager shell):

```bash
npm run tui
```

TUI quick keys:

- `o` onboarding wizard
- `r` refresh dashboard and reset paging
- `v` vacuum
- `p` prune dead letters (30d)

Bridge package (`packages/bridge`) is the shared control-plane API used by both CLI and TUI for:

- config reads/writes
- db stats and operational tables
- maintenance tasks (`vacuum`, prune)
- unified task execution contract (`status`, `logs`, `flow`, `deadletters`, `db.*`)

Security posture check:

```bash
npm run cli -- security rotate-token-check
```

### Flow tracking and visualizer

- TUI visualizer derives stages and transitions from `audit` events.
- CLI equivalent is available via:

```bash
npm run cli -- flow 120
```

## Verification Commands

Run before release or deployment:

```bash
npm run verify
```

Local ASR runs via Transformers.js in the Node runtime; no Python setup is required.

Optional combined pipeline:

```bash
npm run build
```

(`build` currently executes typecheck as the build gate.)

`verify` runs lint, typecheck, and tests with structured step logging for a single-source quality gate.

Deterministic Docker redeploy (recommended after code changes):

```bash
npm run docker:redeploy
```

This performs a cached image rebuild and force-recreates the `remote` service to prevent stale code/image mismatches.
Set `OPENCODE_REMOTE_REDEPLOY_NO_CACHE=1` only when you need a full clean rebuild.
By default it sets `OPENCODE_REMOTE_BUILD_ID` to `git-short-sha + timestamp` so startup fingerprint logs prove which build is running.

Optional post-commit auto-redeploy hook:

```bash
npm run hooks:install
```

This installs `.git/hooks/post-commit` locally and triggers `npm run docker:redeploy` in the background after each commit.
The hook sends a Telegram notice before restart, waits 45s for in-flight replies, redeploys, then sends a back-online notice.
Disable temporarily with `OPENCODE_REMOTE_SKIP_POST_COMMIT_REDEPLOY=1`.
Tune behavior with:
- `OPENCODE_REMOTE_POST_COMMIT_DELAY_SEC=<seconds>`
- `OPENCODE_REMOTE_POST_COMMIT_NOTIFY_TELEGRAM=0`
- `OPENCODE_REMOTE_POST_COMMIT_ENV_ONLY_SECRETS=1` (do not read Telegram token/chat values from `.env` in hook)
Hook logs are written to `data/post-commit-redeploy.log` when writable, otherwise `.git/post-commit-redeploy.log`.

## Initial Provisioning

Set owner phone number:

```bash
npx conf set security.ownerNumber "+15551234567"
```

Owner is auto-seeded into SQLite users on startup.

## Backup and Restore

### Backup

Stop the process, then copy DB and auth directories:

```bash
cp data/opencode-remote.db data/opencode-remote.db.bak
cp -r .wwebjs_auth .wwebjs_auth.bak
```

### Restore

Stop process, replace DB/auth content, restart app.

## Troubleshooting

### Access denied for expected user

Check allowlist:

- `/users list`

Add user:

- `/users add +1555...`

### Duplicate message behavior

Message dedupe uses inbound transport message/update IDs in SQLite `messages` table with rolling cleanup.

### Telegram access denied for expected user

- Bind Telegram identity to an allowlisted phone:
  - `/users bindtg <telegramUserId> <+number> [username]`
- List bindings:
  - `/users tglist`

### Telegram delivery mode conflicts

- If both webhook and polling are enabled, the app defaults to webhook mode and logs a warning.
- Recommended: enable exactly one of:
  - `telegram.webhookEnabled=true` (prod)
  - `telegram.pollingEnabled=true` (dev)
- Webhook mode now requires both:
  - `telegram.webhookUrl` (HTTPS)
  - `telegram.webhookSecret` (non-empty)
- Webhook payload guard: oversized payloads are rejected (HTTP 413) using `telegram.webhookMaxBodyBytes`.
- Persistent conflicts trigger owner alerting and `telegram.polling_conflict` audit events.
- Polling conflict owner alerts are cooldown-limited via `telegram.pollingConflictAlertCooldownMs`.
- Runtime status now includes reset cooldown timing and last recovery error when Telegram returns retry-after limits.
- Runtime startup logs include a deployment fingerprint (version/build-id/mode/token fingerprint suffix) to confirm Docker is running current code.

### Telegram group chat policy

- Group chats are blocked by default (`telegram.allowGroupChats=false`).
- To permit group/supergroup control, explicitly set `telegram.allowGroupChats=true`.

### Advanced command policy

- Mutating advanced control-plane commands are owner-only:
  - `/model set ...`
  - `/mcp add ...`
  - `/mcp connect ...`
  - `/mcp disconnect ...`
- These commands also remain confirmation-gated by safety tier.
- Owner-only denials are audited as `command.blocked` with reason `owner_only_policy`.

### No permission prompt notifications

- Verify OpenCode global event stream is available.
- Check runtime logs for "Global event monitor disabled" warnings.

### Stale session/path context

Use:

- `/session use <id>`
- `/pwd`
- `/cd <path>`

### Run output retrieval

- `/last` or `/latest` fetches the newest run output for your user.
- `/get` without an ID also fetches the newest run output.
- `/get <runId>` fetches a specific run output.

### Voice and image pipeline

- Voice notes are transcribed locally via Transformers.js (`src/media/asr.ts`).
- Image uploads are attached to prompt calls as OpenCode file parts.
- Image/PDF prompts force a per-request model override to `openai/gpt-5.3-codex`.
- If Codex returns the known unsupported-account model error, the request retries once with `opencode/big-pickle` override (without mutating global model config).

Config keys:

- `media.enabled`, `media.voiceEnabled`, `media.imageEnabled`
- `asr.enabled`, `asr.model`, `asr.cacheDir`, `asr.timeoutMs`

## Data Retention Notes

- `messages` table is continuously pruned for recent dedupe window.
- `confirmations` table is pruned by expiration cleanup loop.
- `runs`, `audit`, and `dead_letters` are operator-pruned with CLI/TUI maintenance tasks.
- Audit and dead-letter payloads are redacted before storage for token/secret/bearer-like values.

CLI prune examples:

```bash
npm run cli -- db prune audit 90
npm run cli -- db prune runs 30
npm run cli -- db prune dead_letters 30
```

## Suggested Retention Policy

- Keep `runs` for 30 days.
- Keep `audit` for 90 days.
- Vacuum database weekly during maintenance windows.
