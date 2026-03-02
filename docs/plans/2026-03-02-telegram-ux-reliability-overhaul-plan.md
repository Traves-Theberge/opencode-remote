# Telegram UX + Reliability Overhaul Plan

Status: Complete
Owner: OpenCode Remote
Date: 2026-03-02

## Goals

- Eliminate noisy/unbounded Telegram polling conflict behavior.
- Improve operator observability for transport health from chat status output.
- Make chat responses cleaner and more conversational while preserving deterministic command safety.
- Reduce first-run friction for Telegram interactions and natural-language command entry.

## Scope

### In

- Telegram polling conflict backoff and degraded-state handling.
- Single-instance polling lease guard at app level.
- Runtime status exposure in `/status` output.
- Prompt output cleanup/compaction for chat readability.
- Telegram plain-text shorthand normalization for common commands.
- Tests for formatter cleanup behavior.

### Out (follow-up)

- Full webhook orchestration and self-hosted webhook setup automation.
- Advanced inline keyboard personalization by role/state.
- Rich markdown rendering and per-channel theme profiles.

## Workstreams

1) Transport reliability
- [x] Add transport lease table and store methods.
- [x] Acquire/renew/release polling lease for Telegram polling mode.
- [x] Skip polling start when lease is already owned by another instance.
- [x] Add polling conflict detection + exponential backoff pause.

2) Runtime visibility
- [x] Add transport health reporting from Telegram transport.
- [x] Include transport health summary in `/status` command output.

3) UX smoothing
- [x] Filter SDK event-envelope JSON lines from prompt output.
- [x] Compact prompt response formatting for chat readability.
- [x] Map plain Telegram shorthand (`status`, `runs`, `sessions`, etc.) to commands.

4) Validation
- [x] Add formatter regression test for event-line filtering.
- [x] Run full `npm run verify` and Docker smoke checks.

## Risks

- Lease coordination protects same-DB deployments but cannot prevent external pollers using the same token.
- Polling 409 conflicts from external systems still require operator token hygiene and single-consumer discipline.

## Rollback

- Disable Telegram in `.env` (`TELEGRAM_ENABLED=false`) and restart Compose.
- Re-enable only after token and single-consumer conditions are verified.

## Success criteria

- Repeated 409s no longer spam every poll interval.
- `/status` surfaces Telegram health/degraded state for operators.
- Prompt replies no longer include raw OpenCode event envelopes.
- Common plain Telegram command words behave as expected without strict syntax overhead.
