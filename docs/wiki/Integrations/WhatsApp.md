# WhatsApp Integration

## Purpose

Describe WhatsApp transport behavior, chat ID normalization, and send reliability.

## Source files

- `src/transport/whatsapp.ts`
- `src/index.ts`

## Diagram(s)

- `docs/architecture/04-sequence-whatsapp-inbound.md`
- `docs/architecture/11-state-transport-retry-deadletter.md`

## Key invariants

- chat IDs are normalized before outbound sends.
- retry and dead-letter logic capture inbound processing failures.

## Failure modes

- disconnected client session.
- invalid sender/chat identifiers from malformed payload.

## Operational checks

- `npm run cli -- logs 50`
- `npm run cli -- deadletters 50`

## Related pages

- `docs/wiki/Operations/Troubleshooting.md`
- `docs/wiki/Architecture/Request-Lifecycle.md`
