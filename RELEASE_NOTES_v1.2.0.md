# Release Notes - v1.2.0

Release date: 2026-03-02

## Summary

v1.2.0 hardens OpenCode Remote for production operations with explicit secret hygiene controls, webhook-mode security enforcement, ingress rate limiting, redacted audit persistence, and improved polling conflict observability across runtime, CLI, and TUI.

## Highlights

- Webhook security hardening:
  - `telegram.webhookSecret` is now mandatory in webhook mode.
  - Setup/runtime fail fast when webhook mode is misconfigured.
- Secret hygiene controls:
  - Placeholder token detection at startup.
  - Optional env-only secret mode via `security.requireEnvTokens=true`.
  - CLI security posture command: `npm run cli -- security rotate-token-check`.
- Ingress protection:
  - Per-sender and global token-bucket throttling.
  - Throttle telemetry in audit (`ingress.throttled`).
- Sensitive data protection:
  - Redaction of token/secret/bearer-like values before audit/dead-letter writes.
- Telegram reliability/visibility:
  - Conflict events (`telegram.polling_conflict`, `telegram.polling_recovered`).
  - Owner alerting when conflict threshold is exceeded.
  - Bridge/TUI status includes degraded polling counters and retry timer.
- Cleanup:
  - Removed dead code: `src/audit/logger.ts` and `OpenCodeAdapter.server`.

## Upgrade Notes

1. Run `npm install` after pull.
2. If using webhook mode, ensure both are set:
   - `TELEGRAM_WEBHOOK_URL`
   - `TELEGRAM_WEBHOOK_SECRET`
3. Optional hardening: enable env-only token mode:

```bash
export SECURITY_REQUIRE_ENV_TOKENS=true
```

4. Run security posture check:

```bash
npm run cli -- security rotate-token-check
```

5. Validate health:

```bash
npm run cli -- status
```

## Verification Checklist

- [ ] `npm run verify` passes
- [ ] `npm run cli -- status` shows expected transport mode/state
- [ ] `npm run cli -- security rotate-token-check` returns no FAIL lines
- [ ] Webhook mode fails fast when webhook secret is missing
- [ ] Polling conflicts (if present) appear in status/flow telemetry

## References

- `CHANGELOG.md`
- `docs/SECURITY_REVIEW.md`
- `TOFIX.md`
- `docs/OPERATIONS.md`
