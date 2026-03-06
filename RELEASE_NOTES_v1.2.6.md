# Release Notes - v1.2.6

Date: 2026-03-05

## Highlights

- Fixed vision routing for Telegram media prompts:
  - image/PDF prompts now force per-request `openai/gpt-5.3-codex`
  - avoids text-only model responses when media is attached
- Hardened fallback behavior:
  - unsupported Codex/account error now retries once with `opencode/big-pickle`
  - fallback is request-local and no longer changes the global model config
- Improved prompt and Telegram delivery reliability:
  - prompt flow now waits for message hydration and surfaces backend errors instead of `(no response)`
  - Telegram send path now hard-splits oversized chunks and retries transient network failures (`ECONNRESET`/fetch failed)

## Operator Notes

- Global configured model can remain whatever you prefer for text prompts.
- Media prompts explicitly route to Codex automatically via per-request override.
- If Codex is not available for the current account/session, one fallback retry to Big Pickle is attempted for that request only.

## Version Alignment

- root: `1.2.6`
- workspaces: `0.2.6` (`daemon`, `cli`, `tui`, `bridge`)
