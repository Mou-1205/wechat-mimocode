# WeChat MiMoCode Bridge

<p align="center">
  <strong>Chat with MiMoCode in WeChat, just like texting a friend</strong>
</p>

<p align="center">
  <a href="LICENSE"><img src="https://img.shields.io/badge/License-MIT-green?style=flat-square" alt="License: MIT"></a>
  <a href="https://www.npmjs.com/package/wechat-mimocode"><img src="https://img.shields.io/npm/v/wechat-mimocode?style=flat-square" alt="npm"></a>
  <img src="https://img.shields.io/badge/Lang-English-blue?style=flat-square" alt="English">
  <a href="README.md"><img src="https://img.shields.io/badge/Lang-中文-lightgrey?style=flat-square" alt="中文"></a>
</p>

A fork of [wechat-claude-code](https://github.com/Wechat-ggGitHub/wechat-claude-code) that replaces the Claude Code CLI with [MiMoCode](https://github.com/XiaomiMiMo/MiMo-Code) CLI. After binding WeChat with a QR code, a new "friend" appears in your contacts. Send it a message, and it is forwarded to MiMoCode running on your computer. Replies stream back to WeChat in real time. Supports text, images, voice, and files.

## Highlights

| | |
|---|---|
| **Scan and go** | No server deployment required. Scan a QR code to bind WeChat, and credentials, sessions, and logs are stored locally by default. |
| **MiMoCode-powered** | Uses local MiMoCode CLI for requests, with MiMoCode model, tool, and workspace support. |
| **Native context compression** | Calls MiMoCode CLI's native `/compact` command, session ID remains unchanged, tokens reduced significantly. |
| **History session restore** | Search by index or keyword, restore previous conversations with one click. |
| **Clean messages** | Streaming replies are split automatically so only readable results are pushed back to WeChat. |
| **Typing indicator** | WeChat shows a typing indicator while MiMoCode is processing, so you know it is still working. |
| **Two-way files** | Send images, PDFs, and documents to MiMoCode for analysis; generated files can also be pushed back to WeChat. |
| **Skills auto-translation** | `/skills full` shows installed Skills with descriptions automatically translated to Chinese. |
| **Cross-platform daemon** | The daemon is implemented in TypeScript and supports Windows, macOS, and Linux. |

## Install

**Option 1: Global install (recommended)**

```bash
npm install -g wechat-mimocode
```

After installation, the `wechat-mimocode` command is available anywhere.

**Option 2: From source**

```bash
git clone https://github.com/Mou-1205/wechat-mimocode.git
cd wechat-mimocode
npm install
npm install -g .
```

### Verify installation

```bash
wechat-mimocode --version
```

## Prerequisites

- Node.js >= 18
- Windows / macOS / Linux
- A personal WeChat account
- [MiMoCode](https://github.com/XiaomiMiMo/MiMo-Code) CLI installed and authenticated

> **Note:** MiMoCode model selection, provider settings, and authentication follow the official MiMoCode documentation. You should first confirm MiMoCode CLI works in your terminal before starting this project.

## Quick Start

### 1. Bind WeChat

```bash
wechat-mimocode setup
```

The program will show or open a QR code — scan it with WeChat to bind your account.

### 2. Start the service

```bash
wechat-mimocode daemon start
```

The daemon will long-poll WeChat messages in the background and forward them to the local MiMoCode CLI.

### 3. Start chatting

Open WeChat and send a message to your new "friend".

### Manage the service

```bash
wechat-mimocode daemon status   # Check if running
wechat-mimocode daemon stop     # Stop the service
wechat-mimocode daemon restart  # Restart after updates
wechat-mimocode daemon logs     # View recent logs
```

## WeChat Commands

Send these directly in the WeChat chat:

### Session Management

| Command | Description |
|---------|-------------|
| `/help` | Show available commands |
| `/new` | Start a new topic, show current config |
| `/clear` | Clear current session and start fresh |
| `/reset` | Full reset, including the working directory |
| `/stop` | Stop the current task and clear queued messages |
| `/compact` | Compact context (calls MiMoCode native compression) |
| `/resume` | List last 15 historical sessions |
| `/resume <number>` | Restore session by index |
| `/resume <keyword>` | Search and restore session |
| `/goal <target>` | Set a persistent goal |
| `/goal clear` | Clear the goal |
| `/history [n]` | View recent chat history (default 20) |
| `/undo [n]` | Remove the last N messages (default 1) |

### Configuration

| Command | Description |
|---------|-------------|
| `/model <provider/model>` | Switch MiMoCode model, e.g. `xiaomi/mimo-v2.5` |
| `/prompt <text>` | Set a system prompt, e.g. "reply in Chinese" |
| `/prompt clear` | Clear the system prompt |
| `/cwd <path>` | View or switch the working directory |

### Tools

| Command | Description |
|---------|-------------|
| `/skills` | List installed Skills |
| `/skills full` | List installed Skills (Chinese descriptions) |
| `/status` | View current session state |
| `/send <path>` | Send a local file |
| `/<skill> [args]` | Trigger any installed Skill |

## How It Works

```text
WeChat (phone) ←→ ilink Bot API ←→ Node.js daemon ←→ MiMoCode CLI (local)
```

The daemon long-polls WeChat for new messages, forwards them to the local MiMoCode CLI, and streams replies back to WeChat. Everything runs on your own computer.

## Data Directory

All data is stored in `~/.wechat-mimocode/` by default:

```text
~/.wechat-mimocode/
├── accounts/       # WeChat account credentials
├── config.json     # Global config
├── sessions/       # Session data
└── logs/           # Logs
```

You can also set `WMC_DATA_DIR` to change the data directory, and `WMC_MODEL` to override the default model.

## Safety Notes

This project forwards WeChat messages to a local MiMoCode CLI and allows MiMoCode to process tasks within the configured working directory. Bind only a trusted WeChat account, avoid sensitive paths as the working directory, and use `/send` carefully when sharing local files.

## FAQ

### Q: What if I encounter strange issues?

A: If you encounter abnormal behavior or errors (like "MiMoCode encountered an error, please try again later"):
1. **Let MiMoCode fix it** - Describe the problem in CLI terminal, MiMoCode will try to diagnose and fix
2. **Submit an Issue** - Submit an Issue on GitHub with detailed problem description and reproduction steps
3. **Community discussion** - Other users may have encountered similar problems, discuss solutions together
4. **Check logs** - Run `wechat-mimocode daemon logs` for detailed error information

## Acknowledgements

This project is based on the following projects:

- [wechat-claude-code](https://github.com/Wechat-ggGitHub/wechat-claude-code) - Original project
- [wechat-claude-code-enhanced](https://github.com/UnknownJackMe/wechat-claude-code-enhanced) - Enhanced version, inspired many features

## License

[MIT](LICENSE)
