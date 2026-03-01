# Changelog

All notable changes to this project are documented in this file.

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
