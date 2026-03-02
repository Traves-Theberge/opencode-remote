# Release Notes - v1.2.1

Release date: 2026-03-02

## Summary

v1.2.1 focuses on Telegram polling stability, conflict-noise reduction, and deterministic Docker deployment sync.

## Highlights

- Telegram polling hardening:
  - single in-flight polling loop (no overlapping poll cycles)
  - startup polling session preparation (`deleteWebhook` + `close`)
  - retry-after-aware cooldown handling when Telegram returns 429
- Conflict alert noise reduction:
  - owner polling-conflict notifications are cooldown-limited
  - status output now includes reset cooldown and last recovery error
- Deployment observability:
  - runtime fingerprint logs at startup (version/build-id/transport mode/token suffix)
  - deterministic Docker redeploy helper: `npm run docker:redeploy`
  - build fingerprint wiring via `OPENCODE_REMOTE_BUILD_ID`

## Operator Commands

```bash
npm run docker:redeploy
npm run cli -- status
npm run cli -- flow 120
```

## Notes

- If Telegram returns `429 retry_after` for `close`, the app now respects cooldown windows and avoids repeated reset loops.
- For production reliability, webhook mode remains the preferred transport profile.
