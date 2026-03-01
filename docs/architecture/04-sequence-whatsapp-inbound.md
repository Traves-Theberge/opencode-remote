# Sequence: WhatsApp Inbound Command Path

## Purpose

Trace an inbound WhatsApp message through dedupe, policy, execution, persistence, and response.

## Source files

- `src/transport/whatsapp.ts`
- `src/index.ts`
- `src/router/index.ts`
- `src/commands/executor.ts`
- `src/storage/sqlite.ts`

## Diagram

```mermaid
sequenceDiagram
  participant WA as WhatsApp
  participant APP as App
  participant ACCESS as AccessController
  participant ROUTER as CommandRouter
  participant SAFETY as SafetyEngine
  participant EXEC as CommandExecutor
  participant ADAPTER as OpenCodeAdapter
  participant DB as SQLite

  WA->>APP: incoming message
  APP->>DB: insert dedupe key
  APP->>ACCESS: checkAccess/getOrCreateSession
  APP->>ROUTER: route(body)
  APP->>SAFETY: check(intent)
  APP->>EXEC: execute(intent)
  EXEC->>ADAPTER: call SDK endpoint
  ADAPTER-->>EXEC: command result
  EXEC-->>APP: normalized result
  APP->>DB: append audit + runs
  APP-->>WA: formatted response
```

## Key invariants

- Dedupe happens before expensive execution.
- Dangerous flows require confirmation before execution.
- Runs and audit data persist after each accepted command.

## Failure modes

- Duplicate transport message ID ignored.
- Access denied for non-allowlisted senders.
- Transport send failure after successful execution.

## Operational checks

- `npm test -- tests/telegram.test.ts`
- `npm test -- tests/storage.test.ts`

## Related pages

- `docs/architecture/08-state-message-lifecycle.md`
- `docs/wiki/Architecture/Request-Lifecycle.md`
