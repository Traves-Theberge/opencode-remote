# Database ERD

```mermaid
erDiagram
  USERS {
    text phone PK
    text role
    integer active
    text telegram_user_id
    text telegram_username
    integer created_at
    integer updated_at
  }

  BINDINGS {
    text phone PK
    text active_session_id
    text cwd
    text workspace_root
    text telegram_chat_id
    integer updated_at
  }

  CONFIRMATIONS {
    text id PK
    text phone
    text action_json
    integer expires_at
    integer created_at
  }

  RUNS {
    text run_id PK
    text phone
    text session_id
    text command_type
    text display
    text raw
    integer created_at
  }

  MESSAGES {
    text message_id PK
    text phone
    integer created_at
  }

  AUDIT {
    integer id PK
    text event_type
    text payload_json
    integer created_at
  }

  EVENT_OFFSETS {
    text stream PK
    text last_event_id
    integer updated_at
  }

  DEAD_LETTERS {
    integer id PK
    text channel
    text message_id
    text sender
    text body
    text error
    integer attempts
    text payload_json
    integer created_at
  }

  SCHEMA_MIGRATIONS {
    integer version PK
    text name
    integer applied_at
  }

  USERS ||--|| BINDINGS : "phone"
  USERS ||--o{ CONFIRMATIONS : "phone"
  USERS ||--o{ RUNS : "phone"
  USERS ||--o{ MESSAGES : "phone"
```

## Notes

- `bindings.active_session_id` maps users to OpenCode sessions.
- `confirmations.action_json` stores serialized intent payloads for dangerous action approval.
- `runs` is a retrieval cache for channel-friendly output lookup (`/runs`, `/get`).
- `event_offsets` supports durable stream checkpointing for OpenCode global events.
- `dead_letters` captures failed inbound updates after retry exhaustion.
