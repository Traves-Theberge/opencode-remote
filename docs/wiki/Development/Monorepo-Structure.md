# Monorepo Structure

## Purpose

Describe workspace layout and package boundaries for daemon, CLI, and bridge.

## Source files

- `package.json`
- `apps/daemon/package.json`
- `apps/cli/package.json`
- `packages/bridge/package.json`

## Diagram(s)

- `docs/ARCHITECTURE.md`

## Key invariants

- bridge exports stable APIs consumed by CLI.
- daemon runtime wiring remains isolated to daemon app and `src/`.

## Failure modes

- broken workspace dependency links.
- start scripts pointing to stale file paths.

## Operational checks

- `npm run typecheck:workspaces`
- `npm run test:workspaces`

## Related pages

- `docs/wiki/Development/Testing-Strategy.md`
- `docs/wiki/Development/Quality-Gates.md`
