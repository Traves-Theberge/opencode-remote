# Telegram Integration

## Purpose

Document Telegram transport modes, callback normalization, and policy behavior.

## Source files

- `src/transport/telegram.ts`
- `src/core/config.ts`

## Diagram(s)

- `docs/architecture/05-sequence-telegram-callback.md`
- `docs/architecture/13-deployment-runtime.md`

## Key invariants

- webhook mode wins when both webhook and polling are enabled.
- callback and text updates normalize to shared command model.
- non-private chats are denied by default.

## Failure modes

- invalid webhook URL/secret.
- token mismatch or revoked bot token.

## Operational checks

- `npm run cli -- setup --dry-run`
- `npm test -- tests/telegram.test.ts`

## Related pages

- `docs/wiki/Operations/Onboarding-and-Setup.md`
- `docs/wiki/Security/Access-Control-and-Policy.md`
