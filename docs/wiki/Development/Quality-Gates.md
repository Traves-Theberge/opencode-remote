# Quality Gates

## Purpose

Define release gate expectations and code health checks.

## Source files

- `package.json`
- `scripts/verify.mjs`
- `tsconfig.json`

## Diagram(s)

- `docs/architecture/03-components.md`

## Key invariants

- root TypeScript runs with strict mode enabled.
- verify pipeline is the single-source release gate.
- workspace typecheck/smoke must pass with root checks.

## Failure modes

- lint and typecheck scope drift from new workspace paths.
- release done without running full verify pipeline.

## Operational checks

- `npm run lint`
- `npm run typecheck`
- `npm run verify`

## Related pages

- `docs/wiki/Development/Testing-Strategy.md`
- `docs/README.md`
