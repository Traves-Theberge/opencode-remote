# Architecture

## System Roles

- OpenCode: source of truth for coding sessions, prompts, tools, and permission state.
- WhatsApp (`whatsapp-web.js`) and Telegram (Bot API): command and response transport channels.
- Local SQLite (`better-sqlite3`): control-plane state for routing, authz, idempotency, and cached output retrieval.

## Request Lifecycle

1. Message arrives through transport (`src/transport/whatsapp.js` or `src/transport/telegram.js`).
2. `src/index.js` normalizes sender and applies idempotency check (`messages` table).
3. `src/access/controller.js` checks allowlist and user role from SQLite.
4. `src/router/index.js` maps `@oc` content:
   - plain text -> OpenCode prompt pass-through
   - slash command -> control intent
5. `src/safety/engine.js` blocks denied command patterns.
6. `src/commands/executor.js` calls `src/adapter/opencode.js` with session/cwd context.
7. Result is formatted by `src/presentation/formatter.js` and optionally assigned a run ID.
8. Run metadata is persisted to SQLite (`runs` table).
9. Response is chunked and sent back through the originating transport.

## Event Lifecycle

- `src/adapter/opencode.js` subscribes to OpenCode global event SSE.
- `src/index.js` handles events like `permission.updated`.
- Permission requests are mapped to active session ownership by `bindings.active_session_id`.
- Permission prompts are sent to all available bound channels for the target user.

## Context Model

Per canonical user phone number, the app maintains:

- active OpenCode session ID
- workspace root
- current working directory (cwd)
- local busy/lock state

This context is loaded and persisted through the `bindings` table, including optional Telegram chat binding.

## Reliability Model

- Message idempotency: `messages.message_id` primary key.
- Confirmation TTL enforcement: `confirmations.expires_at` cleanup.
- Durable run retrieval: `runs` table for `/runs` and `/get <id>`.
- Durable audit trail: `audit` table.
- Dead-letter capture: `dead_letters` table for failed inbound transport updates.

## Security Model

- Allowlist/owner enforcement from SQLite `users` table.
- Dangerous command confirmation flow (`/confirm <id>`).
- Shell deny-pattern filtering in `safety` engine.
- Path sandboxing: `cwd` cannot escape `workspace_root`.
