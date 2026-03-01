# State Machines

## Purpose

Capture runtime lifecycle states for messages, sessions, confirmations, and transport retries.

## Source files

- `src/index.ts`
- `src/access/controller.ts`
- `src/safety/engine.ts`
- `src/transport/telegram.ts`
- `src/transport/whatsapp.ts`

## Diagram(s)

- `docs/architecture/08-state-message-lifecycle.md`
- `docs/architecture/09-state-session-lifecycle.md`
- `docs/architecture/10-state-confirmation-lifecycle.md`
- `docs/architecture/11-state-transport-retry-deadletter.md`

## Key invariants

- Each state machine has explicit terminal outcomes.
- retries are bounded; dead-letter is durable.
- confirmation and policy states gate dangerous behavior.

## Failure modes

- stale busy flag causing command starvation.
- dead-letter growth without retention maintenance.

## Operational checks

- `npm run cli -- status`
- `npm run cli -- deadletters 25`

## Related pages

- `docs/wiki/Operations/Retention-and-Maintenance.md`
- `docs/wiki/Security/Safety-Engine-and-Confirmations.md`
