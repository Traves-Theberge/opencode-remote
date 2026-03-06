# Runbook

## Purpose

Provide day-2 operator actions for runtime health and incident response.

## Source files

- `apps/cli/src/index.ts`
- `packages/bridge/src/index.ts`
- `docs/OPERATIONS.md`

## Diagram(s)

- `docs/ARCHITECTURE.md`

## Key invariants

- Use CLI for operational visibility before direct DB intervention.
- Preserve database files during incident triage.

## Failure modes

- accidental pruning of recent audit records.
- stale owner number configuration after machine migration.

## Operational checks

- `npm run cli -- status`
- `npm run cli -- logs 50`
- `npm run cli -- deadletters 50`

## Related pages

- `docs/wiki/Operations/Troubleshooting.md`
- `docs/wiki/Operations/Retention-and-Maintenance.md`
