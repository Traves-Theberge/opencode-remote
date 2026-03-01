# Sequence: Dangerous Command Confirmation Flow

## Purpose

Document the two-step confirmation required for dangerous command intents.

## Source files

- `src/safety/engine.ts`
- `src/index.ts`
- `src/storage/sqlite.ts`

## Diagram

```mermaid
sequenceDiagram
  participant USER as Operator
  participant APP as App
  participant SAFETY as SafetyEngine
  participant DB as SQLite
  participant EXEC as CommandExecutor

  USER->>APP: @oc /shell rm -rf ...
  APP->>SAFETY: evaluate intent
  SAFETY-->>APP: requires confirmation
  APP->>DB: create confirmation(id, expires_at)
  APP-->>USER: prompt /confirm <id>

  USER->>APP: @oc /confirm <id>
  APP->>DB: validate unexpired confirmation
  APP->>EXEC: execute original intent
  APP->>DB: mark used + append audit
  APP-->>USER: execution result
```

## Key invariants

- Dangerous command execution requires a valid pending confirmation.
- Confirmations expire and cannot be reused.

## Failure modes

- Confirmation expired.
- Confirmation ID not found.

## Operational checks

- `npm test -- tests/safety.test.ts`

## Related pages

- `docs/architecture/10-state-confirmation-lifecycle.md`
- `docs/wiki/Security/Safety-Engine-and-Confirmations.md`
