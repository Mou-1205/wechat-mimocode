# WeChat MiMoCode Bridge

<p align="center">
  <strong>Chat with MiMoCode in WeChat, just like texting a friend</strong>
</p>

<p align="center">
  <a href="LICENSE"><img src="https://img.shields.io/badge/License-MIT-green?style=flat-square" alt="License"></a>
  <a href="https://www.npmjs.com/package/wechat-mimocode"><img src="https://img.shields.io/npm/v/wechat-mimocode?style=flat-square" alt="npm"></a>
  <img src="https://img.shields.io/badge/Lang-English-blue?style=flat-square" alt="English">
  <a href="README.md"><img src="https://img.shields.io/badge/Lang-中文-lightgrey?style=flat-square" alt="中文"></a>
</p>

A fork of [wechat-claude-code](https://github.com/Wechat-ggGitHub/wechat-claude-code) that replaces the Claude Code CLI with the MiMoCode CLI.

---

## How It Works

```
WeChat (phone) ←→ ilink Bot API ←→ Node.js daemon ←→ MiMoCode CLI (local)
```

The daemon long-polls WeChat for new messages, forwards them to the local `mimo` CLI, and streams replies back to WeChat.

## Differences from the Original

| Feature | wechat-claude-code | wechat-mimocode |
|---------|-------------------|-----------------|
| CLI command | `claude` | `mimo run` |
| Output format | `--output-format stream-json` | `--format json` |
| Session resume | `--resume <sessionId>` | `--session <sessionId>` |
| Model format | `claude-sonnet-4-6` | `provider/model` (e.g. `xiaomi/mimo-v2.5`) |
| System prompt | `--append-system-prompt` | Inlined into prompt |
| Image passing | Temp file path in prompt | `--file` flag |
| Skill directory | `~/.claude/skills/` | `~/.agents/skills/` + `~/.local/share/mimocode/compose/*/skills/` |
| Data directory | `~/.wechat-claude-code/` | `~/.wechat-mimocode/` |
| Daemon | bash script (macOS/Linux) | Cross-platform TypeScript (Windows supported) |

---

## Install

**Option 1: Global install (recommended)**

```bash
npm install -g wechat-mimocode
```

After installation, the `wechat-mimocode` command is available anywhere.

**Option 2: From source**

```bash
git clone https://github.com/Mou-1205/wechat-mimocode.git
cd wechat-mimocode && npm install && npm install -g .
```

## Quick Start

### 1. Bind WeChat

```bash
wechat-mimocode setup
```

A QR code will pop up — scan it with WeChat.

### 2. Start the service

```bash
wechat-mimocode daemon start
```

### 3. Start chatting

Open WeChat and send a message to your new "friend".

### Manage the service

```bash
wechat-mimocode daemon status   # Check if running
wechat-mimocode daemon stop     # Stop the service
wechat-mimocode daemon restart  # Restart (after updates)
wechat-mimocode daemon logs     # View recent logs
```

---

## WeChat Commands

| Command | Description |
|---------|-------------|
| `/help` | Show available commands |
| `/clear` | Clear current session |
| `/stop` | Stop current task |
| `/model <provider/model>` | Switch model (e.g. `xiaomi/mimo-v2.5`) |
| `/prompt <text>` | Set a system prompt |
| `/cwd <path>` | Switch working directory |
| `/skills` | List installed Skills |
| `/status` | View session state |
| `/history [n]` | View recent chat history |
| `/compact` | Compact context |
| `/reset` | Full reset |
| `/send <path>` | Send a local file |

---

## Prerequisites

- Node.js >= 18
- Windows / macOS / Linux
- A personal WeChat account
- [MiMoCode](https://github.com/XiaomiMiMo/MiMo-Code) CLI installed and authenticated

## Data Directory

```
~/.wechat-mimocode/
├── accounts/       # WeChat account credentials
├── config.json     # Global config
├── sessions/       # Session data
└── logs/           # Logs
```

## License

[MIT](LICENSE)
