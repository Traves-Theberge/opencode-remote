# Security Review

Date: 2026-03-02
Scope: application source (`src/`), apps (`apps/`), bridge package (`packages/bridge/`)
Status: Remediated (all originally logged issues addressed)

## Review Status by File

### Core Runtime (`src/`)

- [x] `src/index.ts` - reviewed
  - Findings: ingress rate limiting added; env-only secret mode validation added; owner alerting added for repeated Telegram polling conflicts.
- [x] `src/router/index.ts` - reviewed
  - Findings: no critical issue found; help/usage now prefix-optional.
- [x] `src/commands/executor.ts` - reviewed
  - Findings: no critical issue found; diagnostics now include runtime transport state.
- [x] `src/presentation/formatter.ts` - reviewed
  - Findings: no critical issue found; filtered SDK event envelopes to reduce data leakage/noise.
- [x] `src/transport/telegram.ts` - reviewed
  - Findings: webhook secret now mandatory when webhook mode enabled; conflict callback hooks added for visibility and alerting.
- [x] `src/transport/whatsapp.ts` - reviewed
  - Findings: no critical issue found; outbound invalid chat-id guard present.
- [x] `src/storage/sqlite.ts` - reviewed
  - Findings: transport lease support present; audit/dead-letter writes now redact sensitive token-like payload content.
- [x] `src/core/config.ts` - reviewed
  - Findings: env override coercion validated; env-only token mode and ingress throttle defaults added.
- [x] `src/adapter/opencode.ts` - reviewed
  - Findings: no critical issue found; legacy unused `server` field removed.
- [x] `src/access/controller.ts` - reviewed
  - Findings: no critical issue found; workspace root escape protections present.
- [x] `src/safety/engine.ts` - reviewed
  - Findings: command safety checks remain syntax/pattern-based; ingress throttling is now implemented at app entrypoint.
- [x] `src/core/logger.ts` - reviewed
  - Findings: no critical issue found.
- [x] `src/audit/logger.ts` - reviewed
  - Findings: removed from runtime codebase (was unused).

### Apps

- [x] `apps/daemon/src/index.ts` - reviewed
  - Findings: no critical issue found.
- [x] `apps/cli/src/index.ts` - reviewed
  - Findings: security helper command added (`security rotate-token-check`).
- [x] `apps/tui/src/index.ts` - reviewed
  - Findings: no critical issue found; task execution is local bridge-mediated.
- [x] `apps/tui/src/opentui-shim.d.ts` - reviewed
  - Findings: no security-sensitive logic.

### Shared Package

- [x] `packages/bridge/src/index.ts` - reviewed
  - Findings: webhook secret now required in setup validation; status surfaces polling conflict health.

## Consolidated Status

Resolved:

1. Webhook secret is now mandatory in setup/runtime webhook mode.
2. Ingress rate limiting added (global + per-sender), with audit visibility.
3. Audit/dead-letter payload redaction added.
4. Dead code removed (`src/audit/logger.ts`, `OpenCodeAdapter.server`).
5. Polling conflict visibility added to bridge/TUI and owner alerting.

Residual (expected):

1. External pollers using the same Telegram token can still trigger 409 conflicts; mitigated via webhook-first production profile, conflict telemetry, and owner alerting.

See `TOFIX.md` for closure details.
