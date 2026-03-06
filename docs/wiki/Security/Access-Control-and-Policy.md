# Access Control and Policy

## Purpose

Define allowlist/owner model and command-level policy enforcement.

## Source files

- `src/access/controller.ts`
- `src/router/index.ts`
- `src/index.ts`
- `docs/COMMAND_MODEL.md`

## Diagram(s)

- `docs/ARCHITECTURE.md`

## Key invariants

- owner is always allowlisted and has elevated policy rights.
- mutating advanced commands are owner-only.
- policy denials are audited with reason metadata.

## Failure modes

- owner number misconfigured.
- stale telegram binding causing target mismatch.

## Operational checks

- `npm test -- tests/router.test.ts`
- `npm run cli -- logs 50`

## Related pages

- `docs/wiki/Security/Safety-Engine-and-Confirmations.md`
- `docs/COMMAND_MODEL.md`
