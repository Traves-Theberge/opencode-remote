# OpenCode Remote

<p align="center">
  <img src="./opencode-remote.png" alt="OpenCode Remote" width="400">
</p>

<p align="center">Control OpenCode from Telegram.</p>

---

### Quick Start

```bash
# 1. Start OpenCode
opencode serve --hostname 127.0.0.1 --port 4096

# 2. In another terminal, run the remote
npm install
npm run cli -- setup
npm start
```

Then message your Telegram bot.

### Docker

```bash
cp .env.docker.example .env
# Edit .env with your bot token and owner
npm run docker:redeploy
```

### What It Does

- Chat with OpenCode through Telegram
- Slash commands for session control (`/session list`, `/last`, `/abort`)
- Owner-only commands for user management and locking
- Voice notes and images get sent to OpenCode automatically
- Failed messages are stored for debugging

### Commands

| Command | Description |
| --- | --- |
| `/help` | Show available commands |
| `/status` | Runtime health check |
| `/session list` | List OpenCode sessions |
| `/last` | Show last run output |
| `/abort` | Stop active run |
| `/users add <+number>` | Allowlist a user |
| `/users bindtg <id> <+number>` | Link Telegram to user |
| `/lock` / `/unlock` | Lock/unlock sessions |

### Requirements

- Node.js 20+
- OpenCode running locally (`127.0.0.1:4096`)
- Telegram bot token

### Development

```bash
npm start           # Run daemon
npm run dev         # Dev mode with watch
npm run cli -- help # CLI commands
npm run verify     # Run tests and checks
```

---

Questions? Open an issue on GitHub.
