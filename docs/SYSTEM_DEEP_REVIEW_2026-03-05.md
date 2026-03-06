# System Deep Review - 2026-03-05

This document walks through each primary application component with purpose,
security posture, dead-code posture, and follow-up recommendations.

## Runtime Entry and Orchestration

### `apps/daemon/src/index.ts`

- Purpose: workspace daemon entrypoint that boots `src/index.ts`.
- Security: neutral; no direct secret handling.
- Dead code: none.
- Recommendation: none.

### `src/index.ts`

- Purpose: end-to-end runtime orchestrator (startup, transport boot, message pipeline, audit, dedupe, run persistence, shutdown).
- Security posture:
  - validates core config and owner bootstrap.
  - uses sender/global rate limits and per-sender execution lock.
  - best-effort media temp file cleanup in `finally`.
- Dead-code posture:
  - removed no-op run-id passthrough; direct output return now used.
- Reliability notes:
  - per-sender queueing avoids overlapping command execution and response races.

## Access and Policy

### `src/access/controller.ts`

- Purpose: allowlist/owner enforcement + session/cwd/workspace state management.
- Security posture:
  - strict workspace-root boundary for CWD updates.
  - confirmation token flow for dangerous actions.
  - stale session eviction avoids stale long-lived in-memory state.
- Dead code: none observed.
- Recommendation: optional max in-memory session cap for very high sender cardinality deployments.

### `src/safety/engine.ts`

- Purpose: guard shell/run command syntax and deny-list patterns.
- Security posture:
  - blocks multiline, command chaining, pipes, subshells, and redirection.
  - deny-list supports regex and fallback substring matching.
- Dead code: none observed.
- Recommendation: consider optional allowlist mode for production-hardening profiles.

## Routing and Execution

### `src/router/index.ts`

- Purpose: slash parsing + natural language fallback + tiered action routing.
- Security posture:
  - dangerous actions route through confirmation gate.
  - owner checks present for model/mcp mutating paths.
- Dead code: no obvious unreachable handlers.
- Recommendation: add lightweight command table generation to reduce handler duplication over time.

### `src/commands/executor.ts`

- Purpose: intent execution against adapter/store/access and formatter output.
- Security posture:
  - model set/mcp actions maintain owner-only checks.
  - no direct secret handling.
- Reliability notes:
  - vision inputs (image/PDF) force per-request `openai/gpt-5.3-codex` override.
- Dead code: none observed.

## OpenCode Adapter Layer

### `src/adapter/opencode.ts`

- Purpose: wraps OpenCode SDK methods and normalizes payload shapes.
- Security posture:
  - no secret persistence; relies on server/provider config.
  - error extraction avoids hidden backend failures.
- Reliability notes:
  - prompt response hydration polling closes async response gap.
  - request-local one-time fallback to `opencode/big-pickle` on known unsupported-account Codex errors.
  - fallback does not mutate global model configuration.
- Dead code: no obvious unreachable branches after latest cleanup.

## Presentation

### `src/presentation/formatter.ts`

- Purpose: channel-safe rendering and truncation for prompts/shell/files/runs.
- Security posture:
  - no direct secret operations.
- Dead-code posture:
  - removed prior no-op `formatWithRunId` path.
- Recommendation: keep aggressive truncation defaults to avoid Telegram flood/rate-limit regressions.

## Transports

### `src/transport/telegram.ts`

- Purpose: polling/webhook lifecycle, update parsing, media extraction, output send/retry.
- Security posture:
  - secret token required; non-private chats blocked by default.
  - webhook secret validation path in webhook mode.
- Reliability notes:
  - polling lease/conflict recovery behavior is implemented.
  - message chunking now hard-splits oversize lines to avoid Telegram 400 length failures.
  - transient network send retries handle `ECONNRESET`/timeout-like failures.
- Dead code: none obvious.
- Recommendation: add optional jittered backoff for repeated transient failures.

### `src/transport/whatsapp.ts`

- Purpose: WhatsApp web lifecycle, QR pairing, incoming processing, send path.
- Security posture:
  - no direct token handling; session auth file path configurable.
- Reliability notes:
  - retry + dead-letter fallback for inbound processing.
- Dead code: no obvious dead paths; feature remains optional via config.

## Media and Persistence

### `src/media/asr.ts`

- Purpose: local voice transcription via Transformers.js + ffmpeg decode pipeline.
- Security posture:
  - local-only processing, no Python subprocess path.
- Reliability notes:
  - model normalization + fallback to default model.
  - hard timeout wrapper to avoid hung transcriptions.
- Dead code: none observed.

### `src/storage/sqlite.ts`

- Purpose: schema, migrations, audit/dead-letter/run/lease persistence APIs.
- Security posture:
  - redaction applied to audit and dead-letter payload/strings.
  - transport lease table supports single active poller semantics.
- Dead code: no obvious unused APIs from current runtime path.
- Recommendation: periodic index review and retention guardrails as dataset grows.

## Ops and Tooling

### `apps/cli/src/index.ts`

- Purpose: setup/status/log/flow/db/security task CLI.
- Security posture: setup validation catches invalid owner/webhook configuration.
- Dead code: none obvious.

### `apps/tui/src/index.ts`

- Purpose: interactive operational dashboard and onboarding.
- Security posture: indirect via bridge, no direct token persistence logic beyond setup fields.
- Dead code: none obvious.

### `packages/bridge/src/index.ts`

- Purpose: shared operational task layer for CLI/TUI.
- Security posture: validation for onboarding inputs, database task wrappers.
- Dead code: none obvious.

### Deployment and hooks

- `scripts/docker-redeploy.sh`: cached rebuild default, explicit no-cache override.
- `scripts/hooks/post-commit`: delayed redeploy + Telegram notifications + env-only secret mode.
- `scripts/hooks/pre-push`: blocks common secret/db leakage paths.

## Consolidated Findings

### Critical

- None identified in this pass.

### Major

- Post-commit hook secret fallback risk mitigated by env-only mode (`OPENCODE_REMOTE_POST_COMMIT_ENV_ONLY_SECRETS=1`).

### Minor

- Consider adding jittered exponential retry for Telegram network instability.
- Consider adding runtime metrics for transport retry classes.

## Recommended Next Pass

- Add health counters to `/status` for send retry classes and recent dead-letter counts by channel.
- Add focused tests for vision per-request model override + fallback branch in adapter/executor tests.
