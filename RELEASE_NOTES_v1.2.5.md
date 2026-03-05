# Release Notes - v1.2.5

Date: 2026-03-05

## Highlights

- Improved post-commit redeploy reliability for Telegram flows:
  - default 45s grace period before restart to let in-flight replies finish
  - Telegram owner notices before restart and after redeploy result (success/failure)
- Removed noisy duplicate reply (`Already processed.`) by silently ignoring deduped messages.
- Fixed `/last` overlap with `/diff` by excluding `diff`/`summarize` from persisted run history.
- Faster Docker rebuild cycle:
  - cached builds are now default (`OPENCODE_REMOTE_REDEPLOY_NO_CACHE=1` for clean rebuild)
  - Dockerfile build layers now keep dependency install cached unless package manifests change

## Operational Notes

- Post-commit behavior can be tuned with:
  - `OPENCODE_REMOTE_POST_COMMIT_DELAY_SEC`
  - `OPENCODE_REMOTE_POST_COMMIT_NOTIFY_TELEGRAM=0`
  - `OPENCODE_REMOTE_SKIP_POST_COMMIT_REDEPLOY=1`

## Version Alignment

- root: `1.2.5`
- workspaces: `0.2.5` (`daemon`, `cli`, `tui`, `bridge`)
