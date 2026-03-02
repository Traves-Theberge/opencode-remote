# Changelog

All notable changes to this project are documented in this file.

## [Unreleased]

### Changed

- Removed `@oc` prefix requirement - commands now work without any prefix

### Added

- Deterministic Docker redeploy script: `scripts/docker-redeploy.sh` (`npm run docker:redeploy`).
  - now auto-stamps `OPENCODE_REMOTE_BUILD_ID` from git short SHA + timestamp when not explicitly set.
- Runtime fingerprint logging at startup (version/build-id/token fingerprint/mode summary).
- Polling recovery diagnostics in status surfaces:
  - reset cooldown timing
  - last recovery error
- Docker build fingerprint wiring:
  - `OPENCODE_REMOTE_BUILD_ID` in `Dockerfile` and `docker-compose.yml`.
- Docker runtime support:
  - `Dockerfile`
  - `docker-compose.yml`
  - `docker-compose.webhook.yml`
  - `.dockerignore`
  - `.env.docker.example`
- Telegram UX + reliability overhaul plan: `docs/plans/2026-03-02-telegram-ux-reliability-overhaul-plan.md`.
- Formatter regression test for prompt event-envelope filtering: `tests/formatter.test.ts`.
- Storage lease coverage for transport single-instance behavior: `tests/storage.test.ts` lease test.
- File-by-file audit checklist: `docs/plans/2026-03-02-file-audit-checklist.md`.
- Security review register: `docs/SECURITY_REVIEW.md`.
- Security/remediation backlog register: `TOFIX.md`.
- Security redaction utility for audit/dead-letter storage: `src/security/redaction.ts`.
- CLI security posture helper: `security rotate-token-check`.
- Release notes for hardened release: `RELEASE_NOTES_v1.2.0.md`.
- Patch release notes for polling/docker sync hardening: `RELEASE_NOTES_v1.2.1.md`.
- Architecture diagram set under `docs/architecture/`:
  - system/context/container/component
  - interaction sequences
  - runtime state machines
  - data flow and deployment runtime views
- Wiki reference set under `docs/wiki/` (architecture, operations, integrations, security, development).
- Executor and adapter contract-style tests for advanced control-plane namespaces:
  - `tests/executor.test.ts`
  - `tests/adapter.test.ts`
- Onboarding validation tests:
  - `tests/onboarding.test.ts`
- TUI smoke coverage:
  - `tests/tui-smoke.test.ts`
- Workspace daemon app (`apps/daemon`) and root runtime wiring.
- Phase 2 control-plane parity command namespaces:
  - `model`: status/list/set
  - `tools`: ids/list
  - `mcp`: status/add/connect/disconnect
  - `skills`: list
  - `opencode`: status/providers/commands/diagnostics
- Adapter support for advanced OpenCode endpoints:
  - provider, command, tool, app agents, mcp, diagnostics surfaces
- Unified task contract in bridge package:
  - task catalog + task execution API shared by CLI and TUI
- Interactive TUI operator cockpit enhancements:
  - keyboard task runner
  - in-TUI onboarding form flow
  - flow visualizer, transition tracker, recent timeline
  - pane-based dashboard navigation (overview/flow/tasks/output)
  - timeline and output paging controls
  - dashboard refresh action (`r`) that resets paging and reloads views
- Installation bootstrap script: `scripts/install.sh`
- Bridge task tests: `tests/bridge.test.ts`
- Monorepo workspace scaffolding:
  - `apps/cli`
  - `apps/tui`
  - `packages/bridge`
- CLI management surface in `apps/cli`:
  - onboarding setup wizard (`setup`)
  - status/log/dead-letter inspection (`status`, `logs`, `deadletters`)
  - db maintenance (`db info`, `db vacuum`, `db prune`)
- TUI management shell in `apps/tui` using OpenTUI:
  - onboarding-required state view
  - runtime and database summary dashboard
- Shared management bridge in `packages/bridge`:
  - unified config access
  - sqlite stats/audit/dead-letter/run queries
  - maintenance operations (vacuum and retention prune)
- New onboarding guide: `docs/ONBOARDING.md`
- Telegram Bot API transport in `src/transport/telegram.ts` with:
  - long polling (dev) and webhook support (prod)
  - inline keyboard shortcuts and callback command routing
  - callback dedupe identity based on Telegram `update_id`
  - Telegram command alias normalization to shared `@oc` command model
  - group/supergroup blocking by default (`telegram.allowGroupChats=false`)
- Dual-channel app orchestration in `src/index.ts` for WhatsApp + Telegram.
- Telegram identity support in SQLite:
  - `users.telegram_user_id`, `users.telegram_username`
  - `bindings.telegram_chat_id`
- Admin command extensions for Telegram identity management:
  - `@oc /users bindtg <telegramUserId> <+number> [username]`
  - `@oc /users unbindtg <telegramUserId>`
  - `@oc /users tglist`
- Dead-letter persistence table and API:
  - migration v3 `dead_letters`
  - `LocalStore.appendDeadLetter(...)`
- Message dedupe hardening:
  - migration v5 composite dedupe key (`channel:sender:transport_message_id`)
  - cross-channel and cross-user collision protection
- Session cache maintenance improvements:
  - stale in-memory session eviction based on age and inactivity windows
- Security hardening:
  - strict E.164 validation for parsed phone input
  - command syntax guardrails for shell/run intents (chaining/subshell/redirection restrictions)
- Development quality scripts in `package.json`:
  - `npm run build` (typecheck-backed build pipeline)
  - `npm run lint` (ESLint for `src/` and `tests/`)
  - `npm run typecheck` (TypeScript no-emit checks)
  - `npm run verify` (single-source quality gate with structured logging)
- ESLint flat config (`eslint.config.js`) and TypeScript project config (`tsconfig.json`).
- Verification runner script: `scripts/verify.mjs`.
- Extended docs set for release and operations:
  - `docs/ERD.md`
  - `docs/OPERATIONS.md`
  - `docs/README.md`
  - `RELEASE_NOTES_v1.1.0.md`
- Full TypeScript migration:
  - source files moved from `.js` to `.ts`
  - test files moved from `.test.js` to `.test.ts`
  - runtime switched to `tsx` (`npm start`, `npm run dev`, `npm test`)
  - no explicit `any` type usage in `src/` and `tests/`

### Changed

- Chat command UX now supports slash commands and natural language without requiring `@oc` prefix (legacy prefix still accepted).
- Help output is redesigned into a concise, task-oriented menu with command descriptions.
- Telegram input normalization now maps plain shorthand (status/help/runs/sessions/diff/abort/pwd) to slash commands.
- Telegram polling conflict handling now applies controlled backoff with degraded-state visibility.
- Telegram polling conflict owner alerts are now cooldown-limited to reduce repeated notification spam.
- Telegram polling startup now prepares session state (`deleteWebhook` + `close` with retry-after-aware cooldown handling).
- Polling loop now enforces single in-flight cycle to avoid overlap and improve conflict stability.
- Telegram outbound message send now escapes HTML entities before `parse_mode=HTML` delivery to prevent `can't parse entities` send failures.
- Runtime `/status` output now includes transport health and polling conflict recovery timing.
- SQLite schema now includes transport lease support (`transport_leases`) to protect polling ownership on shared DB deployments.
- Webhook mode now fails fast unless `telegram.webhookSecret` is configured.
- Bridge/TUI status views now surface Telegram polling degraded state, conflict count, and retry timing.
- App ingress now enforces global and per-sender token-bucket throttling with `ingress.throttled` audit events.
- Startup validation now supports env-only secret mode (`security.requireEnvTokens`) and placeholder-token warnings.
- SQLite audit and dead-letter writes now redact token/secret/bearer-like values before persistence.
- Removed dead code: `src/audit/logger.ts` and unused `OpenCodeAdapter.server` field.
- Package versions bumped for release alignment:
  - root `opencode-remote` -> `1.2.1`
  - workspaces (`daemon`, `cli`, `tui`, `bridge`) -> `0.2.1`
- `/opencode diagnostics` now includes runtime transport and lease status snapshot.
- Documentation updated for prefix-optional command model and webhook-first production profile.
- TSDoc coverage expanded across runtime, transport, bridge, and CLI/TUI entry modules.
- Root TypeScript strict mode is re-enabled with passing project and workspace checks.
- Lint pipeline now targets TypeScript across root and workspace code:
  - `src/**/*.ts`, `tests/**/*.ts`, `apps/**/*.ts`, `packages/**/*.ts`
- Verify pipeline expanded with:
  - workspace typecheck step
  - workspace smoke step
- CLI onboarding now supports `setup --dry-run` and validates:
  - owner phone (E.164)
  - webhook URL format (HTTPS)
  - Telegram token presence when enabled
- Telegram webhook handling now rejects oversized payloads using configurable byte limit.
- CLI and TUI now import bridge via workspace package name (`@opencode-remote/bridge`) instead of relative source path.
- Advanced mutating control-plane commands are now owner-only in routing policy (`model set`, `mcp add/connect/disconnect`).
- Owner-only policy denials now emit `command.blocked` audit events with reason `owner_only_policy`.
- Dependency refresh to latest stable major/minor targets for core runtime/dev stack (including `better-sqlite3`, `conf`, `pino`, `uuid`, `eslint`, and `globals`).
- Root start/dev scripts now run daemon via workspace app (`@opencode-remote/daemon`).
- `.gitignore` strengthened for local DB artifacts (`*.db`, `*.sqlite*`, WAL/SHM).
- Command model docs expanded to describe deterministic namespace parity and safety tiers.
- Operations docs expanded with flow tracking and shared bridge task model.
- Command model docs now include explicit permission/safety policy matrix by namespace.
- Root package updated for npm workspaces and management entry scripts:
  - `npm run cli -- <command>`
  - `npm run tui`
- README and operations docs updated for monorepo, CLI/TUI flows, and bridge-based maintenance.
- README updated for dual-channel setup (Telegram + WhatsApp), admin binding commands, and storage notes.
- Audit flow consolidated to SQLite `audit` table (single write path).
- Inbound processing now includes retry + dead-letter capture for transport failures.
- WhatsApp send path now rejects invalid normalized chat IDs before dispatch.
- Telegram retry settings split from WhatsApp settings:
  - `telegram.messageMaxRetries`
  - `telegram.messageRetryDelayMs`
- Telegram startup mode precedence enforced:
  - when webhook and polling are both enabled, webhook mode is selected and polling is skipped with warning
- Command and data model documentation updated for Telegram identity and dead-letter support.
- README upgraded with badges, full documentation matrix, and explicit quality command coverage.
- Documentation cross-linking expanded across schema, ERD, and operations content.
- Docs index now includes an explicit PR documentation maintenance checklist.

## [1.1.0] - 2026-03-01

### Added

- SQLite control-plane store (`better-sqlite3`) in `src/storage/sqlite.js`.
- Durable tables for users, bindings, confirmations, runs, messages, audit, and event offsets.
- Schema migration tracking with `schema_migrations` and startup migration runner.
- Persistent run retrieval commands: `@oc /runs`, `@oc /get <runId>`.
- Event stream monitor for OpenCode global events and permission push notifications.
- Permission reply commands: `@oc /permission`, `@oc /allow`, `@oc /deny`.
- Extended path/session command set:
  - `/pwd`, `/cd`, `/ls`, `/find`, `/grep`
  - `/session status`, `/session use`, `/session new`
  - `/projects`, `/project use`
- Dedicated formatting layer for WhatsApp output cards in `src/presentation/formatter.js`.
- Comprehensive docs set:
  - `docs/ARCHITECTURE.md`
  - `docs/COMMAND_MODEL.md`
  - `docs/DATA_MODELS.md`
  - `docs/DATABASE_SCHEMA.md`
  - `docs/OPERATIONS.md`
- Additional tests:
  - `tests/storage.test.js`
  - `tests/access.test.js`

### Changed

- Routing model hardened:
  - default `@oc ...` -> OpenCode pass-through prompt
  - slash command namespace for deterministic control-plane actions
- Access/session state migrated from in-memory-only model to SQLite-backed persistence.
- Message idempotency migrated from in-memory cache to SQLite `messages` table.
- Output retrieval migrated from transient in-memory store to SQLite `runs` table.
- Outbound WhatsApp send path normalizes to proper chat IDs for reliability.

### Security

- Confirmation actions are persisted and TTL-enforced.
- Path traversal guard enforces workspace root boundary.
- Dangerous command deny-pattern checks retained and enforced.

### Verification

- Test suite passes (`npm test`) with router, storage, and access coverage.
- Syntax checks pass across updated source modules.

## [1.0.0] - 2026-03-01

### Added

- Initial WhatsApp transport + OpenCode adapter integration.
- Basic command router and command executor.
- Safety engine and append-only file audit logger.
- Initial README and baseline project scaffolding.
