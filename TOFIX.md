# TOFIX

Date closed: 2026-03-02

All items from the 2026-03-02 security/reliability/dead-code backlog are implemented.

## Completed Security Items

1. Secret/token hygiene automation
- Added startup warning for placeholder/example tokens.
- Added `oc-remote security rotate-token-check` helper in CLI/bridge.
- Added `security.requireEnvTokens` env-only secret mode with fail-fast checks.

2. Webhook secret enforcement
- Webhook mode now requires non-empty `telegram.webhookSecret` in bridge setup and runtime validation.

3. Transport-level rate limiting
- Added ingress token-bucket throttling (global + per-sender) with audit event `ingress.throttled`.

4. Audit/dead-letter redaction + retention guidance
- Added payload redaction for token/secret/bearer-like content before SQLite writes.
- Added operational retention guidance and prune commands.

## Completed Reliability Items

1. Polling conflict operator alerting
- Added conflict audit events (`telegram.polling_conflict`, `telegram.polling_recovered`).
- Added owner alert messaging once conflict threshold is crossed.

2. CLI/TUI degraded visibility
- Bridge status now exposes polling health, conflict count, and retry timer.
- TUI overview shows polling health and a degraded badge.

## Completed Cleanup Items

1. Removed unused `src/audit/logger.ts`.
2. Removed unused `OpenCodeAdapter.server` field and shutdown branch.
3. Continued doc normalization to slash-first command model with `@oc` compatibility note only.

## Residual Risk (Expected)

- External Telegram pollers using the same token can still cause 409 conflicts by design.
- Mitigation is now explicit: webhook mode in production plus owner alerting when conflicts persist.
