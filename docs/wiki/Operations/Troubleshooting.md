# Troubleshooting

## Purpose

Common diagnostics for transport, policy, and execution issues.

## Source files

- `src/transport/telegram.ts`
- `src/transport/whatsapp.ts`
- `src/index.ts`
- `docs/OPERATIONS.md`

## Diagram(s)

- `docs/architecture/11-state-transport-retry-deadletter.md`

## Key invariants

- dead-letter events should preserve payload and error context.
- policy denials are auditable via `command.blocked` events.

## Failure modes

- repeated callback retries due to handler exception.
- owner-only policy denials from non-owner operator.

## Operational checks

- `npm run cli -- logs 100`
- `npm run cli -- deadletters 100`
- `npm run cli -- flow 100`

## Related pages

- `docs/wiki/Security/Access-Control-and-Policy.md`
- `docs/wiki/Integrations/WhatsApp.md`
