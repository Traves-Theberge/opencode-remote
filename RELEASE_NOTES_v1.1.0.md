# Release Notes - v1.1.0

Release date: 2026-03-01

## Summary

v1.1.0 upgrades OpenCode Remote from a prototype-grade runtime to a durable local-first control plane with SQLite-backed state, event-driven permission handling, and comprehensive operational documentation.

## Highlights

- SQLite control-plane persistence (`users`, `bindings`, `confirmations`, `runs`, `messages`, `audit`, `event_offsets`)
- OpenCode global event stream monitor with permission push prompts to WhatsApp
- Durable run retrieval commands (`/runs`, `/get <runId>`)
- Expanded command surface for path/session/project/search workflows
- Migration framework with `schema_migrations`
- Comprehensive docs package (architecture, command model, data models, DB schema, ERD, operations)

## Operational Changes

- Owner user auto-seeded into SQLite on startup.
- Message dedupe moved from in-memory to persisted `messages` table.
- Session/cwd binding is now persisted across restarts via `bindings`.
- Confirmation tokens now survive process restarts until expiry.

## Upgrade Notes

1. Ensure Node.js >= 20.
2. Run `npm install` to install `better-sqlite3`.
3. Start service once to initialize DB and apply migrations.
4. Verify owner phone is set:

```bash
npx conf set security.ownerNumber "+15551234567"
```

5. Confirm health with command `/status`.

## Verification Checklist

- [ ] OpenCode server reachable from app host
- [ ] WhatsApp QR pairing succeeds
- [ ] `/status` returns online state
- [ ] `/session list` returns session metadata
- [ ] `/runs` and `/get <id>` work
- [ ] Permission prompt events appear and accept `/allow` or `/deny`

## Known Limitations

- Release tagging cannot be automated unless this directory is initialized as a Git repository.
- Audit table retention is unbounded in current release (policy documented in operations guide).

## References

- `CHANGELOG.md`
- `docs/ARCHITECTURE.md`
- `docs/DATABASE_SCHEMA.md`
- `docs/ERD.md`
- `docs/OPERATIONS.md`
