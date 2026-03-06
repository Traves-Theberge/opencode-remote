# OpenCode Remote

<p align="center">
  <img src="./opencode-remote.png" alt="OpenCode Remote" width="400">
</p>

<p align="center">Control OpenCode from Telegram.</p>

---

### What It Does

OpenCode Remote gives you a chat interface to talk to your local OpenCode instance. You get:

- **Natural language** — just send messages, they go to OpenCode as prompts
- **Session control** — create, switch, list, and abort sessions
- **File handling** — images and voice notes get sent to OpenCode automatically
- **Access control** — only allowlisted Telegram users can interact
- **Safety** — dangerous commands need confirmation, owner-only commands are protected
- **Debugging** — failed messages are logged for inspection

### Quick Start

```bash
# 1. Start OpenCode
opencode serve --hostname 127.0.0.1 --port 4096

# 2. In another terminal, set up the remote
npm install
npm run cli -- setup
npm start
```

Then message your Telegram bot.

### Docker

```bash
cp .env.docker.example .env
# Edit .env with your bot token and owner number
npm run docker:redeploy
```

### Commands

| Command | Description |
| --- | --- |
| `/help` | Show available commands |
| `/status` | Runtime health check |
| `/session list` | List OpenCode sessions |
| `/session new` | Create a new session |
| `/session use <id>` | Switch to a session |
| `/last` | Show last run output |
| `/abort` | Stop active run |
| `/users add <+number>` | Allowlist a user |
| `/users remove <+number>` | Remove from allowlist |
| `/users bindtg <id> <+number>` | Link Telegram to user |
| `/users tglist` | Show Telegram bindings |
| `/lock` | Lock sessions from non-owners |
| `/unlock` | Unlock sessions |

### Configuration

Create a `.env` or use `npx conf set`:

```bash
# Required
telegram.botToken=...          # From @BotFather
telegram.ownerUserId=...        # Your Telegram ID
security.ownerNumber=...       # Your phone number in E.164 format

# Optional
telegram.pollingEnabled=true   # Dev mode (default)
telegram.webhookEnabled=true   # Production mode
media.voiceEnabled=true        # Transcribe voice notes
media.imageEnabled=true        # Forward images to OpenCode
```

### Requirements

- Node.js 20+
- OpenCode running locally (`127.0.0.1:4096`)
- Telegram bot token

### Development

```bash
npm start           # Run daemon
npm run dev         # Watch mode
npm run cli -- help # CLI maintenance commands
npm run verify      # Run tests, lint, typecheck
```

---

Questions? Open an issue on GitHub.
