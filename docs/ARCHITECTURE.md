# Architecture

## System Roles

- OpenCode: source of truth for coding sessions, prompts, tools, and permission state.
- WhatsApp (`whatsapp-web.js`) and Telegram (Bot API): command and response transport channels.
- Local SQLite (`better-sqlite3`): control-plane state for routing, authz, idempotency, and cached output retrieval.
- Monorepo operator surfaces:
  - `apps/daemon` runtime entrypoint
  - `apps/cli` onboarding/maintenance interface
  - `apps/tui` visual operations cockpit
  - `packages/bridge` shared task and management contract

## Request Lifecycle

1. Message arrives through transport (`src/transport/whatsapp.ts` or `src/transport/telegram.ts`).
2. `src/index.ts` normalizes sender and applies idempotency check (`messages` table).
3. `src/access/controller.ts` checks allowlist and user role from SQLite.
4. `src/router/index.ts` maps `@oc` content:
   - plain text -> OpenCode prompt pass-through
   - slash command -> control intent
5. `src/safety/engine.ts` blocks denied command patterns.
6. `src/commands/executor.ts` calls `src/adapter/opencode.ts` with session/cwd context.
7. Result is formatted by `src/presentation/formatter.ts` and optionally assigned a run ID.
8. Run metadata is persisted to SQLite (`runs` table).
9. Response is chunked and sent back through the originating transport.

## Control-Plane Parity Model

- Router command namespaces map deterministic operator commands to typed intents.
- Executor resolves intents to adapter calls.
- Adapter isolates SDK endpoint details from transport and command DSL.
- Namespaces include session/path/exec plus advanced model/tool/MCP/skills/diagnostics controls.

## Event Lifecycle

- `src/adapter/opencode.ts` subscribes to OpenCode global event SSE.
- `src/index.ts` handles events like `permission.updated`.
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

- Message idempotency: `messages.dedup_key` composite key (`channel:sender:transport_message_id`).
- Confirmation TTL enforcement: `confirmations.expires_at` cleanup.
- Durable run retrieval: `runs` table for `/runs` and `/get <id>`.
- Durable audit trail: `audit` table.
- Dead-letter capture: `dead_letters` table for failed inbound transport updates.

## Security Model

- Allowlist/owner enforcement from SQLite `users` table.
- Dangerous command confirmation flow (`/confirm <id>`).
- Shell deny-pattern filtering in `safety` engine.
- Path sandboxing: `cwd` cannot escape `workspace_root`.
