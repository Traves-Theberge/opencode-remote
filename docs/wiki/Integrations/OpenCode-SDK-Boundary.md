# OpenCode SDK Boundary

## Purpose

Document the adapter boundary that isolates SDK endpoint shapes from command routing.

## Source files

- `src/adapter/opencode.ts`
- `src/commands/executor.ts`

## Diagram(s)

- `docs/architecture/03-components.md`
- `docs/architecture/07-sequence-permission-updated-fanout.md`

## Key invariants

- executor calls adapter using intent-specific method contracts.
- adapter normalizes loosely-typed SDK responses into safe app-facing results.

## Failure modes

- SDK response schema drift.
- missing endpoint support in older OpenCode server versions.

## Operational checks

- `npm test -- tests/adapter.test.ts`
- `npm test -- tests/executor.test.ts`

## Related pages

- `docs/wiki/Architecture/Control-Plane-Namespaces.md`
- `docs/wiki/Architecture/Request-Lifecycle.md`
