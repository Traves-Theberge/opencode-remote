# Database Schema

Database: SQLite (`storage.dbPath`, default `./data/opencode-remote.db`)

ERD: `docs/ERD.md`

## Migration Strategy

Migrations are tracked in `schema_migrations` and applied sequentially at startup.

- v1: initial schema
- v2: event offsets

## Tables

### schema_migrations

| Column | Type | Notes |
|---|---|---|
| version | INTEGER PK | Migration version |
| name | TEXT | Migration name |
| applied_at | INTEGER | Epoch ms |

### users

| Column | Type | Notes |
|---|---|---|
| phone | TEXT PK | E.164 normalized |
| role | TEXT | `owner` or `user` |
| active | INTEGER | 1/0 allowlist state |
| created_at | INTEGER | Epoch ms |
| updated_at | INTEGER | Epoch ms |

### bindings

| Column | Type | Notes |
|---|---|---|
| phone | TEXT PK | User phone |
| active_session_id | TEXT | OpenCode session ID |
| cwd | TEXT | Current working directory |
| workspace_root | TEXT | Path boundary root |
| updated_at | INTEGER | Epoch ms |

### confirmations

| Column | Type | Notes |
|---|---|---|
| id | TEXT PK | Short confirmation token |
| phone | TEXT | Requesting user |
| action_json | TEXT | Serialized action intent |
| expires_at | INTEGER | Epoch ms TTL |
| created_at | INTEGER | Epoch ms |

Indexes:

- `idx_confirmations_expires(expires_at)`

### runs

| Column | Type | Notes |
|---|---|---|
| run_id | TEXT PK | Display run ID |
| phone | TEXT | Owning phone |
| session_id | TEXT | OpenCode session ref |
| command_type | TEXT | Intent type |
| display | TEXT | Formatted output |
| raw | TEXT | Full cached output |
| created_at | INTEGER | Epoch ms |

Indexes:

- `idx_runs_phone_created(phone, created_at DESC)`

### messages

| Column | Type | Notes |
|---|---|---|
| message_id | TEXT PK | WhatsApp message ID |
| phone | TEXT | Sender |
| created_at | INTEGER | Epoch ms |

Indexes:

- `idx_messages_created(created_at)`

### audit

| Column | Type | Notes |
|---|---|---|
| id | INTEGER PK AUTOINCREMENT | Row id |
| event_type | TEXT | Event category |
| payload_json | TEXT | Event payload snapshot |
| created_at | INTEGER | Epoch ms |

### event_offsets

| Column | Type | Notes |
|---|---|---|
| stream | TEXT PK | Stream key (e.g. `global`) |
| last_event_id | TEXT | Last processed event id |
| updated_at | INTEGER | Epoch ms |

## Data Ownership Rules

- OpenCode session internals remain in OpenCode.
- SQLite stores control-plane metadata and cache summaries.
- WhatsApp is transport only (no app state ownership).
