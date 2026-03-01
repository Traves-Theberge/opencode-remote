# Data Model and Persistence

## Purpose

Explain SQLite tables, relationships, and persistence responsibilities.

## Source files

- `src/storage/sqlite.ts`
- `docs/DATABASE_SCHEMA.md`
- `docs/ERD.md`

## Diagram(s)

- `docs/architecture/12-data-flow-persistence.md`

## Key invariants

- DB migrations run before runtime operations.
- message dedupe and audit trails are durable.
- bindings encode user/session/channel continuity.

## Failure modes

- migration version skew.
- invalid assumptions about nullable table columns.

## Operational checks

- `npm run cli -- db info`
- `npm run cli -- db prune audit 30`

## Related pages

- `docs/DATABASE_SCHEMA.md`
- `docs/wiki/Operations/Retention-and-Maintenance.md`
