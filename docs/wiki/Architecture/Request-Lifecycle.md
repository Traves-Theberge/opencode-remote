# Request Lifecycle

## Purpose

Document end-to-end message flow for inbound commands and event fan-out.

## Source files

- `src/transport/whatsapp.ts`
- `src/transport/telegram.ts`
- `src/index.ts`
- `src/router/index.ts`
- `src/commands/executor.ts`

## Diagram(s)

- `docs/architecture/04-sequence-whatsapp-inbound.md`
- `docs/architecture/05-sequence-telegram-callback.md`
- `docs/architecture/07-sequence-permission-updated-fanout.md`

## Key invariants

- All inbound inputs normalize to shared `@oc` command grammar.
- Idempotency is enforced before execution.
- Access control and policy checks apply before adapter calls.

## Failure modes

- dedupe collisions from malformed sender IDs.
- fan-out notification failure on one channel.

## Operational checks

- `npm run cli -- flow 50`
- `npm run cli -- logs 50`

## Related pages

- `docs/wiki/Architecture/Control-Plane-Namespaces.md`
- `docs/wiki/Security/Access-Control-and-Policy.md`
