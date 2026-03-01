# Retention and Maintenance

## Purpose

Describe safe DB maintenance and retention controls for operational tables.

## Source files

- `packages/bridge/src/index.ts`
- `apps/cli/src/index.ts`

## Diagram(s)

- `docs/architecture/12-data-flow-persistence.md`

## Key invariants

- prune only supported tables (`audit`, `runs`, `dead_letters`, `messages`).
- VACUUM should run during low activity windows.

## Failure modes

- prune horizon too small, losing needed incident history.
- DB growth from missed maintenance schedule.

## Operational checks

- `npm run cli -- db info`
- `npm run cli -- db prune audit 30`
- `npm run cli -- db vacuum`

## Related pages

- `docs/wiki/Architecture/Data-Model-and-Persistence.md`
- `docs/wiki/Operations/Runbook.md`
