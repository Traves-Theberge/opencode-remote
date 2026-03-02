# File Audit Checklist

Status: Complete
Date: 2026-03-02

## Source (`src/`)

- [x] `src/index.ts` (runtime status, lease integration, message UX updates)
- [x] `src/router/index.ts` (no-prefix parsing, comprehensive help menu)
- [x] `src/commands/executor.ts` (runtime diagnostics/status surfacing, command usage text updates)
- [x] `src/presentation/formatter.ts` (clean output rendering, no-prefix command hints)
- [x] `src/transport/telegram.ts` (conflict backoff, normalization, health status)
- [x] `src/transport/whatsapp.ts` (accept non-prefixed messages, compatibility import)
- [x] `src/storage/sqlite.ts` (transport lease migration + APIs)
- [x] `src/core/config.ts` (env overrides + typed parsing)
- [x] `src/adapter/opencode.ts` (reviewed for dead fields; cleanup pending)
- [x] `src/access/controller.ts` (reviewed; no functional change required)
- [x] `src/safety/engine.ts` (reviewed; no functional change required)
- [x] `src/core/logger.ts` (reviewed; no functional change required)
- [x] `src/audit/logger.ts` (reviewed; appears unused, flagged in `TOFIX.md`)

## Apps / Packages

- [x] `apps/cli/src/index.ts` (reviewed; no command-prefix dependency)
- [x] `apps/tui/src/index.ts` (reviewed; keymap and task UX validated)
- [x] `apps/tui/src/opentui-shim.d.ts` (reviewed; type shim only)
- [x] `apps/daemon/src/index.ts` (reviewed)
- [x] `packages/bridge/src/index.ts` (reviewed)

## Tests

- [x] `tests/router.test.ts` (no-prefix routing coverage)
- [x] `tests/telegram.test.ts` (normalization behavior updates)
- [x] `tests/formatter.test.ts` (event-envelope filtering)
- [x] `tests/storage.test.ts` (transport lease lifecycle)

## Docs

- [x] `README.md` (no-prefix model, docker/webhook updates)
- [x] `CHANGELOG.md` (unreleased updates for UX/reliability overhaul)
- [x] `docs/COMMAND_MODEL.md` (slash/prompt model, optional legacy prefix)
- [x] `docs/OPERATIONS.md` (no-prefix operational commands)
- [x] `docs/ONBOARDING.md` (webhook profile and polling notes)
- [x] `docs/README.md` (index updated with security review)
- [x] `docs/SECURITY_REVIEW.md` (file-level security findings register)
- [x] `TOFIX.md` (security/dead-code backlog)
