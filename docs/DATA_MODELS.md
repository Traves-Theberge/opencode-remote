# Data Models

## Runtime Models

### App Session (in-memory)

Represented in `AccessController.sessions`:

- `id: string`
- `phoneNumber: string` (E.164 normalized)
- `role: 'owner' | 'user'`
- `createdAt: number` (epoch ms)
- `lastActivity: number` (epoch ms)
- `locked: boolean`
- `busy: boolean`
- `activeSessionId: string | null` (OpenCode session ID)
- `workspaceRoot: string | null`
- `cwd: string | null`

This mirrors persisted `bindings` data and supplements it with transient lock/busy activity state.

### Routed Intent

Produced by `CommandRouter.parse()`:

- `command: string` (router command key)
- `tier: 'safe' | 'elevated' | 'dangerous'`
- `args: string[]`
- `raw: string`

Converted by router handlers to executor intents such as:

- `prompt`
- `run`
- `shell`
- `session.*`
- `path.*`
- `find.*`
- `permission.reply`
- `output.get`, `output.runs`

### Execution Context

Created in `CommandExecutor.execute()`:

- `sessionId: string | null`
- `directory: string | null`

Used by OpenCode adapter as query/path scope.

## Persistence Models (SQLite)

### User

- `phone` primary key
- `role`: owner/user
- `active`: allowlist on/off
- `telegram_user_id` optional transport identity mapping
- `telegram_username` optional label

### Binding

- per-phone routing state for active OpenCode session and cwd/workspace root.
- optional `telegram_chat_id` for channel fan-out notifications.

### Confirmation

- durable pending dangerous action approval with TTL.

### Run

- stored output metadata for retrieval commands.

### Message Record

- idempotency key for inbound messages across transports.

### Audit Record

- structured local event log payload snapshots.

### Event Offset

- stream checkpoint state by stream key (currently `global`).

### Dead Letter

- failed inbound transport payload snapshots with attempts, error, and channel.
