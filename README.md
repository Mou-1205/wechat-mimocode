# WeChat MiMoCode Bridge

**通过微信与 MiMoCode 对话，就像和朋友聊天一样**

基于 [wechat-claude-code](https://github.com/Wechat-ggGitHub/wechat-claude-code) 二次开发，将 Claude Code CLI 替换为 MiMoCode CLI。

## 工作原理

```
微信（手机） ←→ ilink Bot API ←→ Node.js 守护进程 ←→ MiMoCode CLI（本地）
```

守护进程通过长轮询监听微信消息，转发给本地 `mimo` CLI 处理，回复实时流式推送回微信。

## 与原版差异

| 项目 | wechat-claude-code | wechat-mimocode |
|------|-------------------|-----------------|
| CLI 命令 | `claude` | `mimo run` |
| 输出格式 | `--output-format stream-json` | `--format json` |
| 会话续接 | `--resume <sessionId>` | `--session <sessionId>` |
| 模型格式 | `claude-sonnet-4-6` | `provider/model` (如 `xiaomi/mimo-v2.5`) |
| 系统提示 | `--append-system-prompt` | 内联到 prompt 前部 |
| 图片传递 | 临时文件路径拼接到 prompt | `--file` 参数 |
| Skill 目录 | `~/.claude/skills/` | `~/.agents/skills/` + `~/.local/share/mimocode/compose/*/skills/` |
| 数据目录 | `~/.wechat-claude-code/` | `~/.wechat-mimocode/` |
| Daemon | bash 脚本（macOS/Linux） | 跨平台 TypeScript（支持 Windows） |

## 快速安装

```bash
git clone <repo-url> wechat-mimocode
cd wechat-mimocode && npm install
```

## 快速开始

### 1. 扫码绑定

```bash
npm run setup
```

弹出二维码，用微信扫码。

### 2. 启动服务

```bash
npm run daemon -- start
```

### 3. 开始聊天

打开微信，给你新出现的那个"好友"发条消息试试。

### 管理服务

```bash
npm run daemon -- status   # 查看运行状态
npm run daemon -- stop     # 停止服务
npm run daemon -- restart  # 重启服务
npm run daemon -- logs     # 查看日志
```

## 微信端命令

| 命令 | 说明 |
|------|------|
| `/help` | 显示帮助 |
| `/clear` | 清除当前会话 |
| `/stop` | 停止当前任务 |
| `/model <provider/model>` | 切换模型（如 `xiaomi/mimo-v2.5`） |
| `/prompt <内容>` | 设置系统提示词 |
| `/cwd <路径>` | 切换工作目录 |
| `/skills` | 查看已安装的 Skill |
| `/status` | 查看会话状态 |
| `/history [数量]` | 查看对话记录 |
| `/compact` | 压缩上下文 |
| `/reset` | 完全重置 |
| `/send <路径>` | 发送本地文件 |

## 前置条件

- Node.js >= 18
- Windows / macOS / Linux
- 个人微信账号
- 已安装 [MiMoCode](https://github.com/xiaomi/mimo) CLI 并完成认证

## 数据目录

```
~/.wechat-mimocode/
├── accounts/       # 微信账号凭证
├── config.json     # 全局配置
├── sessions/       # 会话数据
└── logs/           # 运行日志
```

## License

[MIT](LICENSE)
