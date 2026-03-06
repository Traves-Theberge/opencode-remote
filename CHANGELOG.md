# Changelog

All notable changes to this project are documented in this file.

## [Unreleased]

### Changed

- Removed `/get` command routing and standardized latest-output retrieval on `/last`.
- Unknown slash commands now return deterministic errors instead of falling through to prompt execution.
- Runtime is now Telegram-only: WhatsApp transport and all related config/runtime wiring were removed.
- Removed TUI workspace and references; operations surface is CLI + Telegram.
- Migrated docs to wiki-first structure and removed legacy `docs/architecture/` tree.
- Verification docs step now performs recursive wiki link/path coverage checks.

## [1.2.7] - 2026-03-05

### Changed

- Documentation expanded with deepwiki entrypoint and cross-linked architecture/operations/security guides.
- Reliability and command-routing polish across Telegram command flow.

## [1.2.6] - 2026-03-05

### Changed

- Vision prompts route through per-request model override for consistent media handling.
- Prompt response hydration and error-surfacing behavior hardened.
- Transport retry/chunking robustness improved for Telegram delivery.

## [1.2.5] - 2026-03-05

### Changed

- Post-commit redeploy reliability improved with delay, notifications, and safer push guards.
- Build/redeploy flow optimized with cache-friendly defaults.

## [1.2.4] - 2026-03-05

### Changed

- Local media pipeline and ASR integration stabilized for Telegram-first operation.

## [1.2.1] - 2026-03-02

### Changed

- Polling and deployment synchronization hardening updates.

## [1.2.0] - 2026-03-02

### Changed

- Security and operations hardening release.

## [1.1.0] - 2026-03-01

### Added

- Durable local control-plane persistence and command execution baseline.

## [1.0.0] - 2026-03-01

### Added

- Initial OpenCode remote control runtime.
