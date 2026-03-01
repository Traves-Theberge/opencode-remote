# Operations Guide

## Runtime Paths

- SQLite DB: `storage.dbPath` (default `./data/opencode-remote.db`)
- Audit events: SQLite `audit` table
- Dead letters: SQLite `dead_letters` table
- WhatsApp local auth: `./.wwebjs_auth`

## Start and Stop

Start:

```bash
npm start
```

Dev mode:

```bash
npm run dev
```

Graceful stop:

- `Ctrl+C` or `SIGTERM`
- App closes enabled transports (WhatsApp and/or Telegram) and event stream subscription before exit

## Verification Commands

Run before release or deployment:

```bash
npm run verify
```

Optional combined pipeline:

```bash
npm run build
```

(`build` currently executes typecheck as the build gate.)

`verify` runs lint, typecheck, and tests with structured step logging for a single-source quality gate.

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

- `@oc /users list`

Add user:

- `@oc /users add +1555...`

### Duplicate message behavior

Message dedupe uses inbound transport message/update IDs in SQLite `messages` table with rolling cleanup.

### Telegram access denied for expected user

- Bind Telegram identity to an allowlisted phone:
  - `@oc /users bindtg <telegramUserId> <+number> [username]`
- List bindings:
  - `@oc /users tglist`

### Telegram delivery mode conflicts

- If both webhook and polling are enabled, the app defaults to webhook mode and logs a warning.
- Recommended: enable exactly one of:
  - `telegram.webhookEnabled=true` (prod)
  - `telegram.pollingEnabled=true` (dev)

### Telegram group chat policy

- Group chats are blocked by default (`telegram.allowGroupChats=false`).
- To permit group/supergroup control, explicitly set `telegram.allowGroupChats=true`.

### No permission prompt notifications

- Verify OpenCode global event stream is available.
- Check runtime logs for "Global event monitor disabled" warnings.

### Stale session/path context

Use:

- `@oc /session use <id>`
- `@oc /pwd`
- `@oc /cd <path>`

## Data Retention Notes

- `messages` table is continuously pruned for recent dedupe window.
- `confirmations` table is pruned by expiration cleanup loop.
- `runs` and `audit` currently grow over time; add retention policies if required.
- `dead_letters` currently grows over time; add retention policies if required.

## Suggested Retention Policy (future)

- Keep `runs` for 30 days.
- Keep `audit` for 90 days.
- Vacuum database weekly during maintenance windows.
