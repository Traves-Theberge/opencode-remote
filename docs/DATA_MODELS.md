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

### Binding

- per-phone routing state for active OpenCode session and cwd/workspace root.

### Confirmation

- durable pending dangerous action approval with TTL.

### Run

- stored output metadata for retrieval commands.

### Message Record

- idempotency key for inbound WhatsApp messages.

### Audit Record

- structured local event log payload snapshots.

### Event Offset

- stream checkpoint state by stream key (currently `global`).
