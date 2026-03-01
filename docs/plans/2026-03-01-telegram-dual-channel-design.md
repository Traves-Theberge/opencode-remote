# Telegram + WhatsApp Dual-Channel Design

Date: 2026-03-01

## Goals

- Add Telegram support with rich UI using Telegram Bot API.
- Keep WhatsApp and Telegram feature parity for command behavior.
- Use a hybrid UX on Telegram (natural text + slash commands + buttons).
- Support long polling for development and webhook for production.
- Keep security and safety rules consistent across channels.

## Chosen Direction

Use a transport plugin architecture:

- Reuse existing core pipeline (router, safety, executor, store).
- Add `TelegramTransport` next to `WhatsAppTransport`.
- Normalize both channels into one internal message pipeline.
- Keep command semantics identical; enhance Telegram UI via inline keyboards and callbacks.

## Architecture

1. `App` orchestrates both transports.
2. Each transport emits normalized inbound events.
3. `App` resolves sender identity and routes intent through existing core components.
4. Transport-specific response formatting and delivery happen at transport layer.

## Identity and Access

- Keep phone number as canonical user identity.
- Add Telegram identity fields to local user model:
  - `telegram_user_id` (source of truth)
  - `telegram_username` (label)
- Access checks remain centralized in `AccessController`.

## Telegram UX

- Plain text defaults to prompt behavior.
- Slash commands mapped to the same intents as WhatsApp control commands.
- Inline keyboard for common actions: status, sessions, diff, runs, help, abort.
- Callback actions map back to deterministic command text.
- Progress/result flow supports message edits where available.

## Reliability

- Dev: long polling with offset tracking.
- Prod: webhook mode with secret verification.
- Retries with backoff for inbound failures.
- Failed inbound payloads go to `dead_letters` with `channel='telegram'`.

## Security

- Bot token stored only in config store.
- Webhook secret validation in webhook mode.
- Same safety engine and dangerous-command confirmation path across channels.
- Callback payload validation with strict action patterns.

## Data Model Changes

Add migrations for:

- `users.telegram_user_id` (unique, nullable)
- `users.telegram_username` (nullable)
- `bindings.telegram_chat_id` (nullable)

`dead_letters` table already supports channel tagging.

## Testing Strategy

- Unit tests for Telegram update parsing, callback handling, retry/dead-letter behavior.
- Integration parity tests across WhatsApp and Telegram for shared intents.
- Access-control tests for owner/user/denied on Telegram identity mapping.
- Regression tests to ensure no WhatsApp behavior drift.

## Rollout Plan

1. Add Telegram behind feature flag.
2. Owner-only Telegram dogfood phase.
3. Allowlisted user rollout and parity validation.
4. Update docs/runbook and switch to dual-channel default.
