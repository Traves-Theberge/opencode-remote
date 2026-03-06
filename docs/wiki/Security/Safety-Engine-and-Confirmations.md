# Safety Engine and Confirmations

## Purpose

Explain dangerous command blocking and confirmation token behavior.

## Source files

- `src/safety/engine.ts`
- `src/index.ts`
- `src/storage/sqlite.ts`

## Diagram(s)

- `docs/ARCHITECTURE.md`
- `docs/COMMAND_MODEL.md`

## Key invariants

- shell/run patterns that violate safety rules are blocked.
- dangerous intents require explicit confirm action before execution.

## Failure modes

- overly broad deny regex blocks benign command.
- user retries expired confirmation ID.

## Operational checks

- `npm test -- tests/safety.test.ts`
- `npm run cli -- logs 50`

## Related pages

- `docs/wiki/Security/Access-Control-and-Policy.md`
- `docs/ARCHITECTURE.md`
