# WeChat MiMoCode Bridge

<p align="center">
  <strong>通过微信与 MiMoCode 对话，就像和朋友聊天一样</strong>
</p>

<p align="center">
  <a href="LICENSE"><img src="https://img.shields.io/badge/License-MIT-green?style=flat-square" alt="License"></a>
  <a href="https://www.npmjs.com/package/wechat-mimocode"><img src="https://img.shields.io/npm/v/wechat-mimocode?style=flat-square" alt="npm"></a>
  <a href="README_en.md"><img src="https://img.shields.io/badge/Lang-English-lightgrey?style=flat-square" alt="English"></a>
  <img src="https://img.shields.io/badge/Lang-中文-blue?style=flat-square" alt="中文">
</p>

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

**方式一：全局安装（推荐）**

```bash
npm install -g wechat-mimocode
```

安装后，任何目录下都能直接使用 `wechat-mimocode` 命令。

**方式二：从源码安装**

```bash
git clone https://github.com/Mou-1205/wechat-mimocode.git
cd wechat-mimocode && npm install && npm install -g .
```

**方式三：使用 yarn**

```bash
yarn global add wechat-mimocode
```

**方式四：使用 pnpm**

```bash
pnpm add -g wechat-mimocode
```

### 验证安装

```bash
wechat-mimocode --version
```

### 前置条件

- Node.js >= 18
- Windows / macOS / Linux
- 个人微信账号
- 已安装 [MiMoCode](https://github.com/XiaomiMiMo/MiMo-Code) CLI 并完成认证

## 快速开始

### 1. 扫码绑定

```bash
wechat-mimocode setup
```

弹出二维码，用微信扫码。

### 2. 启动服务

```bash
wechat-mimocode daemon start
```

### 3. 开始聊天

打开微信，给你新出现的那个"好友"发条消息试试。

### 管理服务

```bash
wechat-mimocode daemon status   # 查看运行状态
wechat-mimocode daemon stop     # 停止服务
wechat-mimocode daemon restart  # 重启服务
wechat-mimocode daemon logs     # 查看日志
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

## 数据目录

```
~/.wechat-mimocode/
├── accounts/       # 微信账号凭证
├── config.json     # 全局配置
├── sessions/       # 会话数据
└── logs/           # 运行日志
```

## 常见问题 (FAQ)

### Q: 安装后命令找不到怎么办？

A: 确保 npm 全局安装路径在系统 PATH 中。运行 `npm config get prefix` 查看安装路径。

### Q: 扫码后没有出现好友怎么办？

A: 请确保：
1. 使用个人微信账号（不支持企业微信）
2. 微信版本是最新的
3. 等待几分钟，有时需要一些时间同步

### Q: 消息发送失败怎么办？

A: 检查：
1. MiMoCode CLI 是否已安装并认证
2. 网络连接是否正常
3. 查看日志：`wechat-mimocode daemon logs`

### Q: 如何切换工作目录？

A: 在微信中发送 `/cwd <路径>` 命令。

### Q: 支持群聊吗？

A: 目前仅支持个人聊天，暂不支持群聊。

### Q: 如何更新到最新版本？

A: 运行 `npm update -g wechat-mimocode`

### Q: 数据安全吗？

A: 所有数据存储在本地，不会上传到任何服务器。微信消息通过官方 API 传输。

## License

源代码基于 [MIT 许可证](LICENSE) 开源。
