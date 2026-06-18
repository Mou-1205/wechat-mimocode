---
name: wechat-mimocode
description: 微信消息桥接 - 在微信中与 MiMoCode 聊天。支持文字对话、图片识别、实时进度推送、斜杠命令。
---

# WeChat MiMoCode Bridge

通过个人微信与本地 MiMoCode 进行对话。

## 前置条件

- Node.js >= 18
- Windows / macOS / Linux
- 个人微信账号（需扫码绑定）
- 已安装 [MiMoCode](https://github.com/XiaomiMiMo/MiMo-Code) CLI 并完成认证

## 安装

**方式一：全局安装（推荐）**

```bash
npm install -g wechat-mimocode
```

安装后任意目录可直接使用 `wechat-mimocode` 命令。

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

## 触发场景

用户提到"微信桥接"、"微信聊天"、"wechat bridge"、"连接微信"、"微信状态"、"停止微信"等与微信桥接相关的话题时触发。

## 触发后的执行流程

**被触发时，不要直接执行任何操作，先探查当前状态再给出可用操作。**

按顺序检查以下状态：

### 第 1 步：检查是否已安装

```bash
wechat-mimocode --version
```

- 如果命令不存在：提示用户执行 `npm install -g wechat-mimocode` 安装。
- 如果返回版本号：继续下一步。

### 第 2 步：检查是否已绑定微信账号

```bash
ls ~/.wechat-mimocode/accounts/*.json 2>/dev/null | head -1
```

- 如果没有账号文件：提示用户需要先执行 `wechat-mimocode setup` 扫码绑定，询问是否现在执行。
- 如果有账号文件：继续下一步。

### 第 3 步：检查 daemon 运行状态

```bash
wechat-mimocode daemon status
```

### 第 4 步：根据状态展示信息

**如果 daemon 未运行：**

```
微信桥接已绑定但未运行。

可用操作：
  wechat-mimocode setup         重新扫码绑定（换号或过期时使用）
  wechat-mimocode daemon start  启动服务
  wechat-mimocode daemon logs   查看上次运行的日志
```

**如果 daemon 正在运行：**

```
微信桥接正在运行（PID: xxx）。

可用操作：
  wechat-mimocode daemon stop     停止服务
  wechat-mimocode daemon restart  重启服务（代码更新后使用）
  wechat-mimocode daemon logs     查看运行日志

微信端命令（直接在微信中发送）：
  /help      显示帮助
  /new       开启新话题，显示当前配置
  /clear     清除当前会话，开始新对话
  /reset     完全重置，包括工作目录等设置
  /stop      停止当前任务并清空排队消息
  /compact   压缩上下文（调用 MiMoCode 原生压缩）
  /resume    列出最近 15 个历史会话
  /goal      设置持续性目标
  /history   查看最近对话记录
  /undo      撤销最近几条对话
  /model     切换 MiMoCode 模型
  /prompt    设置系统提示词
  /cwd       切换工作目录
  /skills    查看已安装的 skill
  /send      发送本地文件
  /<skill>   触发任意已安装的 Skill
```

如果用户明确指定了操作（如"启动微信"、"停止微信服务"、"看看日志"等），跳过状态展示直接执行对应命令。

## 子命令参考

| 命令 | 执行 | 说明 |
|------|------|------|
| `wechat-mimocode setup` | 全局命令 | 首次安装向导：生成 QR 码 → 微信扫码 → 配置工作目录 |
| `wechat-mimocode daemon start` | 全局命令 | 启动守护进程（后台运行） |
| `wechat-mimocode daemon stop` | 全局命令 | 停止守护进程 |
| `wechat-mimocode daemon restart` | 全局命令 | 重启守护进程 |
| `wechat-mimocode daemon status` | 全局命令 | 查看运行状态 |
| `wechat-mimocode daemon logs` | 全局命令 | 查看最近日志 |

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

## 数据目录

所有数据存储在 `~/.wechat-mimocode/`：

```
~/.wechat-mimocode/
├── accounts/       # 绑定的微信账号数据（每个账号一个 JSON）
├── config.json     # 全局配置（工作目录、模型、系统提示词）
├── sessions/       # 会话数据（每个账号一个 JSON）
├── get_updates_buf # 消息轮询同步缓冲
└── logs/           # 运行日志（每日轮转，保留 30 天）
```
