# Testing Strategy

## Purpose

Summarize coverage domains and confidence layering across unit/contract/smoke tests.

## Source files

- `tests/router.test.ts`
- `tests/executor.test.ts`
- `tests/adapter.test.ts`
- `tests/bridge.test.ts`
- `tests/tui-smoke.test.ts`

## Diagram(s)

- `docs/architecture/03-components.md`

## Key invariants

- router tests validate intent parsing and policy constraints.
- executor/adapter tests validate namespace behavior and boundary mapping.
- smoke tests validate workspace scripts and runtime assumptions.

## Failure modes

- non-deterministic tests from shared DB paths.
- OpenTUI runtime assumptions changing under Bun updates.

## Operational checks

- `npm test`
- `npm run verify`

## Related pages

- `docs/wiki/Development/Quality-Gates.md`
- `docs/wiki/Architecture/Control-Plane-Namespaces.md`
