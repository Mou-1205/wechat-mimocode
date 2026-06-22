# WeChat MiMoCode v2.6.6

## 重大更新：原生微信接入 + 代码质量重构

### 核心优势

| | |
|---|---|
| **原生接入微信** | 通过微信官方 ClawBot（iLink Bot）接口实现，使用微信官方 API，**无封号风险**。 |
| **无需第三方服务** | 不依赖任何第三方中转服务器，所有数据在本地处理，安全可控。 |
| **扫码即用** | 不用部署服务器。微信扫码绑定后即可使用，账号凭证、会话和日志默认保存在本地。 |
| **MiMoCode 驱动** | 使用本地 MiMoCode CLI 处理请求，支持 MiMoCode 的模型、工具调用和本地工作区能力。 |

### 代码质量重构（15 个模块）

本次更新对整个代码库进行了全面重构，提升了代码质量、可维护性和类型安全：

| 模块 | 改进内容 |
|------|----------|
| 入口主程序 | 提取 `utils/` 模块，拆分大函数，引入 `HandlerContext` 类型 |
| 配置系统 | 统一 `DATA_DIR` 计算，添加配置验证 |
| 守护进程 | 修复同步等待 bug（`setTimeout` → `Atomics.wait`），统一跨平台处理 |
| 会话管理 | 简化接口，添加输入验证，统一 normalize/trim 逻辑 |
| 存储系统 | 添加 `StoreError` 类，路径验证，泛型类型安全 |
| 日志系统 | 结构化 JSON 日志，日志级别过滤，增强脱敏（支持手机号、邮箱、API Key） |
| 命令系统 | 提取 `ok()`/`forward()` 辅助函数，消除重复代码 |
| MiMoCode 集成 | 提取 `spawnAndCollect`，添加模型格式验证 |
| 微信 API | 新增 `RateLimiter` 类，`requestWithRetry` 泛型重试机制 |
| 登录系统 | 提取 `LoginError`/`AccountError` 类，改善错误处理 |
| 消息监控 | 改善退避策略（指数退避 + 随机抖动），拆分轮询逻辑 |
| 消息发送 | 提取 `buildMessage`/`buildFileItem`，统一错误处理 |
| 媒体处理 | 统一 CDN 数据提取，消除重复代码 |
| 类型定义 | 添加 JSDoc 注释，澄清字段语义 |

### Bug 修复

- **修复默认模型**：更新为 `mimo/mimo-auto`（MiMoCode 免费模型）
- **修复 SQL LIKE 特殊字符**：`[WeChat]` 前缀现在能正确过滤微信会话
- **修复守护进程同步等待**：使用 `Atomics.wait` 替代无效的 `setTimeout`

### 功能测试验证

所有 16 个命令在微信端测试通过：

| 命令 | 功能 | 状态 |
|------|------|------|
| `/help` | 帮助信息 | 通过 |
| `/status` | 会话状态 | 通过 |
| `/version` | 版本号 | 通过 |
| `/clear` | 清除会话 | 通过 |
| `/history` | 对话记录 | 通过 |
| `/model` | 模型管理 | 通过 |
| `/skills` | 技能列表 | 通过 |
| `/cwd` | 工作目录 | 通过 |
| `/goal` | 目标设置 | 通过 |
| `/new` | 新会话 | 通过 |
| `/stop` | 停止处理 | 通过 |
| `/resume` | 恢复历史 | 通过 |
| `/undo` | 撤销对话 | 通过 |
| `/prompt` | 系统提示词 | 通过 |
| `/skills full` | 完整描述 | 通过 |
| 普通消息 | AI 对话 | 通过 |

### 安装

```bash
npm install -g wechat-mimocode@2.6.6
```

### 升级

```bash
npm update -g wechat-mimocode
```

### 完整命令列表

**会话管理：**
- `/help` - 显示帮助
- `/new` - 开启新话题
- `/clear` - 清除当前会话
- `/reset` - 完全重置
- `/stop` - 停止当前任务
- `/compact` - 压缩上下文
- `/resume` - 恢复历史会话
- `/history` - 查看对话记录
- `/undo` - 撤销对话

**配置：**
- `/model <provider/model>` - 切换模型
- `/prompt <内容>` - 设置系统提示词
- `/cwd <路径>` - 切换工作目录

**工具：**
- `/skills` - 列出已安装的 Skill
- `/status` - 查看当前状态
- `/send <路径>` - 发送本地文件
- `/goal <目标>` - 设置持续性目标

### 致谢

感谢所有贡献者和用户的支持！

---

## 有问题请提交 Issues

如果在使用过程中遇到任何问题或有改进建议，请在 GitHub 上提交 Issue：

**[提交 Issue](https://github.com/Mou-1205/wechat-mimocode/issues/new)**

提交 Issue 时请包含：
- 问题描述
- 复现步骤
- 期望行为 vs 实际行为
- 环境信息（操作系统、Node.js 版本、微信版本）
- 相关日志（运行 `wechat-mimocode daemon logs` 获取）


