# System Audit - 2026-03-05

## Scope

Reviewed runtime and operator surfaces across:

- `src/` core application modules
- `src/transport/` channel adapters
- `src/adapter/` OpenCode integration
- `src/storage/` persistence layer
- `apps/` daemon/CLI/TUI entrypoints
- `packages/bridge/` shared operations API

Audit focus:

- security posture and data handling
- dead code and low-value code paths
- operational reliability risks
- documentation coverage gaps

## Security Review (SCRAM)

### Strengths

- Strong command safety policy in `src/safety/engine.ts` blocks chaining, pipes, redirection, subshells, and multiline commands.
- Access controls are centralized (`src/access/controller.ts`) with owner/allowlist checks and role-aware command handling.
- Sensitive payload redaction is used before storing audit/dead-letter records (`src/security/redaction.ts`).
- Push guardrails prevent common data leakage paths (`scripts/hooks/pre-push`) for `.env` and database artifacts.
- Telegram media/file handling writes to temp files and cleanup is attempted in `finally` blocks in `src/index.ts`.

### Findings

#### Major - Local `.env` token parsing inside post-commit hook

- Location: `scripts/hooks/post-commit`
- Observation: hook reads `TELEGRAM_BOT_TOKEN` and `TELEGRAM_OWNER_USER_ID` from `.env` when env vars are absent.
- Risk: local secret handling in shell scripts increases accidental disclosure surface (logs/process inspection/shell debug misuse).
- Recommendation: prefer environment-only secret injection for hook notifications in hardened environments and document opt-out path.
- Status update: implemented env-only mode via `OPENCODE_REMOTE_POST_COMMIT_ENV_ONLY_SECRETS=1`.

#### Minor - Telegram transient network errors remain a delivery risk under unstable networks

- Location: `src/transport/telegram.ts`
- Observation: transient retries exist, but repeated upstream instability can still produce delayed/missed responses.
- Risk: user-visible latency and occasional response gaps.
- Recommendation: add optional exponential backoff jitter and transport-level health metric export.

### Current Security Verdict

- Overall: **Acceptable with targeted hardening follow-ups**.
- Critical blockers found: **none**.

## Dead Code / Low-Value Code Review

### Removed in this pass

- Removed no-op run-id formatter pass-through:
  - deleted `MessageFormatter.formatWithRunId(...)` in `src/presentation/formatter.ts`
  - replaced call site return with direct output in `src/index.ts`

### Verified active code paths

- Model override path for vision inputs in `src/commands/executor.ts` is active and required.
- Request-local fallback retry in `src/adapter/opencode.ts` is active and required for unsupported-account Codex failures.
- Hard chunk splitting in `src/transport/telegram.ts` is active and required to prevent Telegram `message is too long` errors.

### Candidate follow-ups (not removed yet)

- Consider reducing duplication in CLI/TUI task rendering wrappers where bridge output contracts are already normalized.
- Consider centralizing repeated status string assembly logic across formatter/CLI output for maintainability.

## Reliability Review

- Prompt hydration polling in `src/adapter/opencode.ts` addresses empty immediate parts and reduces `(no response)` outcomes.
- Telegram polling lease handling in `src/index.ts` correctly prevents concurrent pollers but introduces expected handoff delay windows.
- Cached Docker rebuilds now preserve dependency layers; full rebuild remains available via `OPENCODE_REMOTE_REDEPLOY_NO_CACHE=1`.

## Documentation Coverage Updates Needed

- Keep image recognition routing behavior aligned across:
  - `README.md`
  - `docs/COMMAND_MODEL.md`
  - `docs/OPERATIONS.md`
  - `docs/wiki/Integrations/Telegram.md`

## ADR-Style Decisions Captured

1. Prompt responses should poll message hydration before concluding no output.
   - Driver: prevent silent `(no response)` results from async backend completion timing.
   - Alternatives: immediate-return only, global event-stream dependency.

2. Vision prompts should enforce a per-request Codex model override.
   - Driver: maintain image/PDF support independent of global default model.
   - Alternatives: force global model change, reject vision inputs when non-vision model is configured.

3. Unsupported Codex/account failures should retry once with request-local Big Pickle fallback.
   - Driver: preserve user completion without permanently mutating global model config.
   - Alternatives: hard fail, mutate global model setting.

## Next Actions

- Add optional hook secret policy mode (`env-only`) to disable `.env` fallback reads in `scripts/hooks/post-commit`.
- Add transport health counters for Telegram send retry/failure classes to runtime status output.
- Keep dead-code cleanup incremental; avoid broad refactors without behavior-preserving tests.
