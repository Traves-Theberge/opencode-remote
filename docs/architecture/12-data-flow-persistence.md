# Data Flow and Persistence

## Purpose

Map command/event data paths to SQLite tables and key relationships.

## Source files

- `src/storage/sqlite.ts`
- `docs/DATABASE_SCHEMA.md`
- `docs/ERD.md`

## Diagram

```mermaid
flowchart TB
  inbound[Inbound Message] --> messages[(messages)]
  command[Parsed Intent] --> audit[(audit)]
  command --> runs[(runs)]
  user[User Management] --> users[(users)]
  session[Session Binding] --> bindings[(bindings)]
  confirm[Dangerous Command] --> confirmations[(confirmations)]
  fail[Failed Processing] --> deadletters[(dead_letters)]
  event[Global Event SSE] --> offsets[(event_offsets)]

  users --> bindings
  bindings --> runs
  users --> audit
```

## Key invariants

- `messages` dedupe key enforces idempotency across channel/sender/message ID.
- `bindings` anchors phone-to-session/cwd/workspace and telegram chat mapping.
- audit and runs together provide explainability + retrieval.

## Failure modes

- migration drift between code and DB.
- stale bindings after external OpenCode session changes.

## Operational checks

- `npm run cli -- db info`
- `npm run cli -- db vacuum`

## Related pages

- `docs/wiki/Architecture/Data-Model-and-Persistence.md`
- `docs/DATABASE_SCHEMA.md`
