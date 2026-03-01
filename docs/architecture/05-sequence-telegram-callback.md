# Sequence: Telegram Callback Path

## Purpose

Show callback updates from inline Telegram actions mapped into shared command handling.

## Source files

- `src/transport/telegram.ts`
- `src/index.ts`
- `src/router/index.ts`

## Diagram

```mermaid
sequenceDiagram
  participant TG as Telegram Bot API
  participant APP as App
  participant ROUTER as CommandRouter
  participant EXEC as CommandExecutor
  participant DB as SQLite

  TG->>APP: callback_query update
  APP->>DB: dedupe using update_id
  APP->>ROUTER: normalize callback data to @oc command
  APP->>EXEC: execute intent
  EXEC-->>APP: result
  APP->>DB: append audit + run
  APP-->>TG: callback answer + message
```

## Key invariants

- `update_id` is the callback dedupe identity.
- Callback aliases map to the same `@oc` grammar as text input.

## Failure modes

- Invalid callback payload.
- Non-private chat callback blocked by policy.

## Operational checks

- `npm test -- tests/telegram.test.ts`

## Related pages

- `docs/wiki/Integrations/Telegram.md`
- `docs/wiki/Architecture/Control-Plane-Namespaces.md`
