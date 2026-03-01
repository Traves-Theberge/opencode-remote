# Architecture

## System Roles

- OpenCode: source of truth for coding sessions, prompts, tools, and permission state.
- WhatsApp (`whatsapp-web.js`): command and response transport channel.
- Local SQLite (`better-sqlite3`): control-plane state for routing, authz, idempotency, and cached output retrieval.

## Request Lifecycle

1. WhatsApp message arrives in `src/transport/whatsapp.js`.
2. `src/index.js` normalizes sender and applies idempotency check (`messages` table).
3. `src/access/controller.js` checks allowlist and user role from SQLite.
4. `src/router/index.js` maps `@oc` content:
   - plain text -> OpenCode prompt pass-through
   - slash command -> control intent
5. `src/safety/engine.js` blocks denied command patterns.
6. `src/commands/executor.js` calls `src/adapter/opencode.js` with session/cwd context.
7. Result is formatted by `src/presentation/formatter.js` and optionally assigned a run ID.
8. Run metadata is persisted to SQLite (`runs` table).
9. Response is chunked and sent back to WhatsApp.

## Event Lifecycle

- `src/adapter/opencode.js` subscribes to OpenCode global event SSE.
- `src/index.js` handles events like `permission.updated`.
- Permission requests are mapped to the active WhatsApp user session by `bindings.active_session_id`.
- Permission prompts are sent to WhatsApp with action commands (`/allow`, `/deny`, `/permission`).

## Context Model

Per phone number, the app maintains:

- active OpenCode session ID
- workspace root
- current working directory (cwd)
- local busy/lock state

This context is loaded and persisted through the `bindings` table.

## Reliability Model

- Message idempotency: `messages.message_id` primary key.
- Confirmation TTL enforcement: `confirmations.expires_at` cleanup.
- Durable run retrieval: `runs` table for `/runs` and `/get <id>`.
- Durable audit trail: `audit` table plus append-only file logger.

## Security Model

- Allowlist/owner enforcement from SQLite `users` table.
- Dangerous command confirmation flow (`/confirm <id>`).
- Shell deny-pattern filtering in `safety` engine.
- Path sandboxing: `cwd` cannot escape `workspace_root`.
