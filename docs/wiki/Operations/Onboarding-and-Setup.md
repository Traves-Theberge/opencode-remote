# Onboarding and Setup

## Purpose

Document recommended first-time setup for daemon and Telegram.

## Source files

- `apps/cli/src/index.ts`
- `docs/ONBOARDING.md`
- `README.md`

## Diagram(s)

- `docs/ARCHITECTURE.md`

## Key invariants

- owner number must be valid E.164.
- webhook mode requires HTTPS URL and bot token.

## Failure modes

- setup without required telegram token.
- webhook and polling both enabled unexpectedly.

## Operational checks

- `npm run cli -- setup --dry-run`
- `npm run cli -- setup`

## Related pages

- `docs/ONBOARDING.md`
- `docs/wiki/Integrations/Telegram.md`
