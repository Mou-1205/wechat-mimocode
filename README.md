# WeChat MiMoCode Bridge

<p align="center">
  <strong>通过微信与 MiMoCode 对话，就像和朋友聊天一样</strong>
</p>

<p align="center">
  <a href="LICENSE"><img src="https://img.shields.io/badge/License-MIT-green?style=flat-square" alt="License: MIT"></a>
  <a href="https://www.npmjs.com/package/wechat-mimocode"><img src="https://img.shields.io/npm/v/wechat-mimocode?style=flat-square" alt="npm"></a>
  <a href="README_en.md"><img src="https://img.shields.io/badge/Lang-English-lightgrey?style=flat-square" alt="English"></a>
  <img src="https://img.shields.io/badge/Lang-中文-blue?style=flat-square" alt="中文">
</p>

基于 [wechat-claude-code](https://github.com/Wechat-ggGitHub/wechat-claude-code) 二次开发，将 Claude Code CLI 替换为 [MiMoCode](https://github.com/XiaomiMiMo/MiMo-Code) CLI。扫码绑定微信后，你的微信里会多出一个好友。给它发消息，消息会自动转发给你电脑上运行的 MiMoCode，回复也会实时推送到微信。支持文字、图片、语音和文件收发。

## 核心优势

| | |
|---|---|
| **原生接入微信** | 通过接入微信 ClawBot（iLink Bot）实现，使用微信官方 API，**无封号风险**。 |
| **无需第三方服务** | 不依赖任何第三方中转服务器，所有数据在本地处理，安全可控。 |
| **扫码即用** | 不用部署服务器。微信扫码绑定后即可使用，账号凭证、会话和日志默认保存在本地。 |
| **MiMoCode 驱动** | 使用本地 MiMoCode CLI 处理请求，支持 MiMoCode 的模型、工具调用和本地工作区能力。 |
| **原生上下文压缩** | 调用 MiMoCode CLI 原生 `/compact` 命令，session ID 保持不变，token 大幅减少。 |
| **历史对话恢复** | 支持按编号、关键词搜索历史会话，一键恢复之前的对话。 |
| **消息不刷屏** | 流式回复会自动分段，只推送可读结果，避免工具调用和中间过程把微信刷屏。 |
| **"对方正在输入中..."** | MiMoCode 处理任务时，微信顶部会显示输入状态，长任务也能感知它仍在工作。 |
| **文件双向收发** | 可以把图片、PDF、文档等发给 MiMoCode 分析；生成的文件也可直接推送回微信。 |
| **Skills 自动翻译** | `/skills full` 显示已安装的 Skill 列表，描述自动翻译为中文。 |
| **跨平台守护进程** | 使用 TypeScript 实现守护进程，支持 Windows、macOS 和 Linux。 |

## 为什么选择我们？

### 🔒 安全可靠

- **原生微信 API**：通过微信官方 ClawBot（iLink Bot）接口接入，不是第三方逆向协议
- **无封号风险**：使用官方授权的 Bot 接口，不会触发微信的风控机制
- **本地化部署**：所有数据存储在你的电脑上，不经过任何第三方服务器

### 🚀 简单易用

- **三步启动**：`install` → `setup` → `start`，无需复杂配置
- **扫码绑定**：像添加好友一样简单
- **即时响应**：消息实时推送，体验流畅

## 快速安装

**方式一：全局安装（推荐）**

```bash
npm install -g wechat-mimocode
```

安装后，任何目录下都可以直接使用 `wechat-mimocode` 命令。

**方式二：从源码安装**

```bash
git clone https://github.com/Mou-1205/wechat-mimocode.git
cd wechat-mimocode
npm install
npm install -g .
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

程序会显示或打开二维码，请用微信扫码完成绑定。

### 2. 启动服务

```bash
wechat-mimocode daemon start
```

服务启动后会在后台通过长轮询监听微信消息，并转发给本地 MiMoCode CLI。

### 3. 开始聊天

打开微信，给新出现的那个"好友"发消息即可。

### 管理服务

```bash
wechat-mimocode daemon status   # 查看运行状态
wechat-mimocode daemon stop     # 停止服务
wechat-mimocode daemon restart  # 重启服务（更新后使用）
wechat-mimocode daemon logs     # 查看最近日志
```

## 微信端命令

直接在微信聊天中发送即可：

### 会话管理

| 命令 | 说明 |
|------|------|
| `/help` | 显示帮助 |
| `/new` | 开启新话题，显示当前配置 |
| `/clear` | 清除当前会话，开始新对话 |
| `/reset` | 完全重置，包括工作目录等设置 |
| `/stop` | 停止当前任务并清空排队消息 |
| `/compact` | 压缩上下文（调用 MiMoCode 原生压缩） |
| `/resume` | 列出最近 15 个历史会话 |
| `/resume <编号>` | 按编号恢复历史会话 |
| `/resume <关键词>` | 搜索并恢复历史会话 |
| `/goal <目标>` | 设置持续性目标 |
| `/goal clear` | 清除目标 |
| `/history [数量]` | 查看最近对话记录（默认 20 条） |
| `/undo [数量]` | 撤销最近几条对话（默认 1 条） |

### 配置

| 命令 | 说明 |
|------|------|
| `/model <provider/model>` | 切换 MiMoCode 模型，如 `xiaomi/mimo-v2.5` |
| `/prompt <内容>` | 设置系统提示词，如"用中文回答" |
| `/prompt clear` | 清除系统提示词 |
| `/cwd <路径>` | 查看或切换工作目录 |

### 工具

| 命令 | 说明 |
|------|------|
| `/skills` | 列出已安装的 Skill |
| `/skills full` | 列出已安装的 Skill（中文描述） |
| `/status` | 查看当前会话状态 |
| `/send <路径>` | 发送本地文件 |
| `/<skill> [参数]` | 触发任意已安装的 Skill |

## 工作原理

```text
微信（手机） ←→ 微信 ClawBot API ←→ Node.js 守护进程 ←→ MiMoCode CLI（本地）
```

### 什么是 ClawBot？

ClawBot 是微信官方提供的 Bot 接口（iLink Bot），允许开发者通过官方 API 创建微信机器人。与第三方逆向协议不同，ClawBot 是微信官方支持的方式，具有以下特点：

- ✅ **官方授权**：微信官方认可的 Bot 接入方式
- ✅ **稳定可靠**：不会因微信更新而失效
- ✅ **无封号风险**：使用官方 API，不违反微信使用条款
- ✅ **功能完整**：支持文字、图片、文件、语音等多种消息类型

### 消息流程

1. 用户在微信中发送消息
2. 微信 ClawBot API 接收消息并推送到守护进程
3. 守护进程转发给本地 MiMoCode CLI 处理
4. MiMoCode 的回复通过守护进程推送回微信
5. 用户在微信中收到回复

## 与上游差异

| 项目 | wechat-claude-code | wechat-mimocode |
|------|-------------------|-----------------|
| CLI 命令 | `claude` | `mimo` |
| 输出格式 | `--output-format stream-json` | `--format json` |
| 会话续接 | `--resume <sessionId>` | `--session <sessionId>` |
| 模型格式 | `claude-sonnet-4-6` | `provider/model`，如 `xiaomi/mimo-v2.5` |
| 系统提示 | `--append-system-prompt` | 拼接到 prompt 前部 |
| 图片传递 | 临时文件路径拼接到 prompt | 临时文件 + `-f` 参数 |
| Skill 目录 | `~/.claude/skills/` | `~/.agents/skills/` 与 `~/.local/share/mimocode/compose/*/skills/` |
| 数据目录 | `~/.wechat-claude-code/` | `~/.wechat-mimocode/` |
| 守护进程 | bash 脚本，偏 macOS/Linux | TypeScript 实现，支持 Windows/macOS/Linux |

## 数据目录

所有数据默认存储在 `~/.wechat-mimocode/`：

```text
~/.wechat-mimocode/
├── accounts/       # 微信账号凭证
├── config.json     # 全局配置
├── sessions/       # 会话数据
└── logs/           # 运行日志
```

也可以通过环境变量 `WMC_DATA_DIR` 指定数据目录，通过 `WMC_MODEL` 指定默认模型。

## 安全提醒

本项目通过微信官方 ClawBot API 接入微信，**无封号风险**。所有消息传输使用官方加密通道，安全可靠。

本项目会把微信消息转发给本地 MiMoCode CLI，并允许 MiMoCode 在指定工作目录内处理任务。请只绑定你信任的微信账号，避免把工作目录设置到敏感路径，并谨慎使用 `/send` 发送本地文件。

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

### Q: 遇到奇怪的问题怎么办？

A: 如果遇到异常行为或错误（如"MiMoCode处理请求时出错，请稍后再试"）：
1. **让 MiMoCode 自行修复** - 在 CLI 终端中描述问题，MiMoCode 会尝试诊断和修复
2. **提交 Issue** - 在 GitHub 上提交 Issue，详细描述问题和复现步骤
3. **社区讨论** - 其他用户可能遇到过类似问题，可以一起讨论解决方案
4. **查看日志** - 运行 `wechat-mimocode daemon logs` 获取详细错误信息

## 致谢

本项目基于以下项目二次开发：

- [wechat-claude-code](https://github.com/Wechat-ggGitHub/wechat-claude-code) - 原始项目
- [wechat-claude-code-enhanced](https://github.com/UnknownJackMe/wechat-claude-code-enhanced) - 增强版项目，提供了许多功能灵感

## License

[MIT](LICENSE)
