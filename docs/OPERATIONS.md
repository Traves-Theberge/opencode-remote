# Operations Guide

## Runtime Paths

- SQLite DB: `storage.dbPath` (default `./data/opencode-remote.db`)
- File audit log: `data/audit.log`
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
- App closes WhatsApp client and event stream subscription before exit

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

Message dedupe uses WhatsApp message IDs in SQLite `messages` table with rolling cleanup.

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

## Suggested Retention Policy (future)

- Keep `runs` for 30 days.
- Keep `audit` for 90 days.
- Vacuum database weekly during maintenance windows.
