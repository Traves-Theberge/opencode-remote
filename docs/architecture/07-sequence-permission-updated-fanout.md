# Sequence: permission.updated Event Fan-out

## Purpose

Describe how OpenCode global permission events are mapped to user channels.

## Source files

- `src/adapter/opencode.ts`
- `src/index.ts`
- `src/access/controller.ts`
- `src/storage/sqlite.ts`

## Diagram

```mermaid
sequenceDiagram
  participant SDK as OpenCode Event Stream
  participant APP as App
  participant ACCESS as AccessController
  participant DB as SQLite
  participant WA as WhatsApp
  participant TG as Telegram

  SDK->>APP: permission.updated
  APP->>DB: persist global event offset
  APP->>ACCESS: map active session ID to phone
  ACCESS->>DB: lookup binding by session_id
  APP->>DB: resolve telegram binding for phone
  APP-->>WA: permission card
  APP-->>TG: permission card
```

## Key invariants

- Event offsets persist to support restart continuity.
- Fan-out targets the mapped session owner; owner fallback is used when needed.

## Failure modes

- Session mapping missing for event session ID.
- One transport fails while another succeeds.

## Operational checks

- `npm run cli -- logs 100`
- `npm run cli -- flow 50`

## Related pages

- `docs/wiki/Architecture/Request-Lifecycle.md`
- `docs/wiki/Integrations/OpenCode-SDK-Boundary.md`
