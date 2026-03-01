# System Overview

## Purpose

High-level architecture narrative for OpenCode Remote runtime surfaces.

## Source files

- `src/index.ts`
- `docs/ARCHITECTURE.md`
- `docs/architecture/01-system-context.md`
- `docs/architecture/02-containers.md`

## Diagram(s)

- `docs/architecture/01-system-context.md`
- `docs/architecture/02-containers.md`

## Key invariants

- A single daemon orchestrates command processing and transport IO.
- OpenCode provides execution semantics; SQLite provides local control state.
- CLI/TUI rely on `@opencode-remote/bridge` for management tasks.

## Failure modes

- Daemon starts without required owner number.
- OpenCode server unavailable at boot.

## Operational checks

- `npm start`
- `npm run cli -- status`

## Related pages

- `docs/wiki/Architecture/Request-Lifecycle.md`
- `docs/wiki/Development/Monorepo-Structure.md`
