# Full File Review - 2026-03-05

This is the exhaustive tracked-file review checklist for the repository state on 2026-03-05.

Legend:

- `Deep`: code path or operationally critical file reviewed in detail.
- `Surface`: reviewed for purpose, consistency, and obvious risk/dead-code signals.

## Root and meta

- [x] `/.dockerignore` (Surface)
- [x] `/.env.docker.example` (Surface)
- [x] `/.gitignore` (Deep)
- [x] `/CHANGELOG.md` (Deep)
- [x] `/Dockerfile` (Deep)
- [x] `/README.md` (Deep)
- [x] `/RELEASE_NOTES_v1.1.0.md` (Surface)
- [x] `/RELEASE_NOTES_v1.2.0.md` (Surface)
- [x] `/RELEASE_NOTES_v1.2.1.md` (Surface)
- [x] `/RELEASE_NOTES_v1.2.4.md` (Surface)
- [x] `/RELEASE_NOTES_v1.2.5.md` (Surface)
- [x] `/RELEASE_NOTES_v1.2.6.md` (Surface)
- [x] `/TOFIX.md` (Surface)
- [x] `/docker-compose.webhook.yml` (Surface)
- [x] `/docker-compose.yml` (Deep)
- [x] `/eslint.config.js` (Surface)
- [x] `/package-lock.json` (Surface)
- [x] `/package.json` (Deep)
- [x] `/tsconfig.json` (Surface)

## GitHub automation

- [x] `/.github/workflows/verify.yml` (Surface)

## Applications

### CLI

- [x] `/apps/cli/package.json` (Surface)
- [x] `/apps/cli/src/index.ts` (Deep)
- [x] `/apps/cli/tsconfig.json` (Surface)

### Daemon

- [x] `/apps/daemon/package.json` (Surface)
- [x] `/apps/daemon/src/index.ts` (Deep)
- [x] `/apps/daemon/tsconfig.json` (Surface)

### TUI

- [x] `/apps/tui/package.json` (Surface)
- [x] `/apps/tui/src/index.ts` (Deep)
- [x] `/apps/tui/src/opentui-shim.d.ts` (Surface)

## Shared package

- [x] `/packages/bridge/package.json` (Surface)
- [x] `/packages/bridge/src/index.ts` (Deep)
- [x] `/packages/bridge/tsconfig.json` (Surface)

## Runtime source

- [x] `/src/index.ts` (Deep)
- [x] `/src/core/config.ts` (Deep)
- [x] `/src/core/logger.ts` (Surface)
- [x] `/src/access/controller.ts` (Deep)
- [x] `/src/router/index.ts` (Deep)
- [x] `/src/commands/executor.ts` (Deep)
- [x] `/src/adapter/opencode.ts` (Deep)
- [x] `/src/presentation/formatter.ts` (Deep)
- [x] `/src/safety/engine.ts` (Deep)
- [x] `/src/security/redaction.ts` (Surface)
- [x] `/src/storage/sqlite.ts` (Deep)
- [x] `/src/transport/telegram.ts` (Deep)
- [x] `/src/transport/whatsapp.ts` (Deep)
- [x] `/src/media/asr.ts` (Deep)

## Scripts and hooks

- [x] `/scripts/check-doc-links.mjs` (Surface)
- [x] `/scripts/docker-redeploy.sh` (Deep)
- [x] `/scripts/hooks/post-commit` (Deep)
- [x] `/scripts/hooks/pre-push` (Deep)
- [x] `/scripts/install-git-hook-post-commit.sh` (Surface)
- [x] `/scripts/install.sh` (Surface)
- [x] `/scripts/verify.mjs` (Surface)

## Tests

- [x] `/tests/access.test.ts` (Deep)
- [x] `/tests/adapter.test.ts` (Deep)
- [x] `/tests/bridge.test.ts` (Deep)
- [x] `/tests/executor.test.ts` (Deep)
- [x] `/tests/formatter.test.ts` (Deep)
- [x] `/tests/onboarding.test.ts` (Surface)
- [x] `/tests/router.test.ts` (Deep)
- [x] `/tests/safety.test.ts` (Deep)
- [x] `/tests/storage.test.ts` (Deep)
- [x] `/tests/telegram.test.ts` (Deep)
- [x] `/tests/tui-smoke.test.ts` (Surface)

## Documentation

### Top-level docs

- [x] `/docs/ARCHITECTURE.md` (Surface)
- [x] `/docs/COMMAND_MODEL.md` (Deep)
- [x] `/docs/DATABASE_SCHEMA.md` (Surface)
- [x] `/docs/DATA_MODELS.md` (Surface)
- [x] `/docs/ERD.md` (Surface)
- [x] `/docs/ONBOARDING.md` (Surface)
- [x] `/docs/OPERATIONS.md` (Deep)
- [x] `/docs/README.md` (Deep)
- [x] `/docs/SECURITY_REVIEW.md` (Surface)
- [x] `/docs/SYSTEM_AUDIT_2026-03-05.md` (Deep)
- [x] `/docs/SYSTEM_DEEP_REVIEW_2026-03-05.md` (Deep)

### Architecture set

- [x] `/docs/architecture/README.md` (Surface)
- [x] `/docs/architecture/01-system-context.md` (Surface)
- [x] `/docs/architecture/02-containers.md` (Surface)
- [x] `/docs/architecture/03-components.md` (Surface)
- [x] `/docs/architecture/04-sequence-whatsapp-inbound.md` (Surface)
- [x] `/docs/architecture/05-sequence-telegram-callback.md` (Surface)
- [x] `/docs/architecture/06-sequence-dangerous-confirmation.md` (Surface)
- [x] `/docs/architecture/07-sequence-permission-updated-fanout.md` (Surface)
- [x] `/docs/architecture/08-state-message-lifecycle.md` (Surface)
- [x] `/docs/architecture/09-state-session-lifecycle.md` (Surface)
- [x] `/docs/architecture/10-state-confirmation-lifecycle.md` (Surface)
- [x] `/docs/architecture/11-state-transport-retry-deadletter.md` (Surface)
- [x] `/docs/architecture/12-data-flow-persistence.md` (Surface)
- [x] `/docs/architecture/13-deployment-runtime.md` (Surface)

### Plans

- [x] `/docs/plans/2026-03-01-telegram-dual-channel-design.md` (Surface)
- [x] `/docs/plans/2026-03-01-telegram-formatting-design.md` (Surface)
- [x] `/docs/plans/2026-03-02-file-audit-checklist.md` (Surface)
- [x] `/docs/plans/2026-03-02-telegram-ux-reliability-overhaul-plan.md` (Surface)

### Wiki docs

- [x] `/docs/wiki/Home.md` (Surface)

- [x] `/docs/wiki/Architecture/Control-Plane-Namespaces.md` (Surface)
- [x] `/docs/wiki/Architecture/Data-Model-and-Persistence.md` (Surface)
- [x] `/docs/wiki/Architecture/Request-Lifecycle.md` (Surface)
- [x] `/docs/wiki/Architecture/State-Machines.md` (Surface)
- [x] `/docs/wiki/Architecture/System-Overview.md` (Surface)

- [x] `/docs/wiki/Development/Monorepo-Structure.md` (Surface)
- [x] `/docs/wiki/Development/Quality-Gates.md` (Surface)
- [x] `/docs/wiki/Development/Testing-Strategy.md` (Surface)

- [x] `/docs/wiki/Integrations/OpenCode-SDK-Boundary.md` (Surface)
- [x] `/docs/wiki/Integrations/Telegram.md` (Deep)
- [x] `/docs/wiki/Integrations/WhatsApp.md` (Surface)

- [x] `/docs/wiki/Operations/Onboarding-and-Setup.md` (Surface)
- [x] `/docs/wiki/Operations/Retention-and-Maintenance.md` (Surface)
- [x] `/docs/wiki/Operations/Runbook.md` (Surface)
- [x] `/docs/wiki/Operations/Troubleshooting.md` (Surface)

- [x] `/docs/wiki/Security/Access-Control-and-Policy.md` (Surface)
- [x] `/docs/wiki/Security/Safety-Engine-and-Confirmations.md` (Surface)

## Summary

- Tracked files reviewed: complete checklist closed for current tracked set.
- Deep-reviewed (code/ops critical): runtime, adapter, transport, storage, hooks, and targeted docs.
- Surface-reviewed: architecture/wiki/release-note corpus for consistency and drift.
- Local-only untracked file intentionally excluded: `config.json`.
