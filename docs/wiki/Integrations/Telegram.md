# Telegram Integration

## Purpose

Document Telegram transport modes, callback normalization, and policy behavior.

## Source files

- `src/transport/telegram.ts`
- `src/core/config.ts`

## Diagram(s)

- `docs/ARCHITECTURE.md`
- `docs/wiki/End-to-End-Guide.md`

## Key invariants

- webhook mode wins when both webhook and polling are enabled.
- callback and text updates normalize to shared command model.
- non-private chats are denied by default.
- media updates (voice/image/document-image) are normalized into prompt inputs.
- image/PDF prompts are routed with a per-request `openai/gpt-5.3-codex` override.
- unsupported-account Codex failures retry once with request-local `opencode/big-pickle` fallback.

## Failure modes

- invalid webhook URL/secret.
- token mismatch or revoked bot token.

## Operational checks

- `npm run cli -- setup --dry-run`
- `npm test -- tests/telegram.test.ts`

## Related pages

- `docs/wiki/Operations/Onboarding-and-Setup.md`
- `docs/wiki/Security/Access-Control-and-Policy.md`
