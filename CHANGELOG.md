# Changelog

All notable changes to this project are documented in this file.

## [Unreleased]

### Added

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

- README updated for dual-channel setup (Telegram + WhatsApp), admin binding commands, and storage notes.
- Audit flow consolidated to SQLite `audit` table (single write path).
- Inbound processing now includes retry + dead-letter capture for transport failures.
- Telegram retry settings split from WhatsApp settings:
  - `telegram.messageMaxRetries`
  - `telegram.messageRetryDelayMs`
- Telegram startup mode precedence enforced:
  - when webhook and polling are both enabled, webhook mode is selected and polling is skipped with warning
- Command and data model documentation updated for Telegram identity and dead-letter support.
- README upgraded with badges, full documentation matrix, and explicit quality command coverage.
- Documentation cross-linking expanded across schema, ERD, and operations content.

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
