# Control-Plane Namespaces

## Purpose

Describe deterministic command families and namespace ownership policy.

## Source files

- `src/router/index.ts`
- `src/commands/executor.ts`
- `docs/COMMAND_MODEL.md`

## Diagram(s)

- `docs/architecture/03-components.md`

## Key invariants

- Natural language becomes `prompt` intent.
- Slash commands map to typed namespace intents.
- Mutating advanced namespace actions are owner-only.

## Failure modes

- unsupported command spelling from transport alias mismatch.
- policy regression allowing non-owner mutating actions.

## Operational checks

- `npm test -- tests/router.test.ts`
- `npm test -- tests/executor.test.ts`

## Related pages

- `docs/COMMAND_MODEL.md`
- `docs/wiki/Security/Access-Control-and-Policy.md`
