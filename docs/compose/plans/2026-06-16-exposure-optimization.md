# 增加 wechat-mimocode 项目曝光率 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use compose:subagent (recommended) or compose:execute to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 通过 npm 生态优化、GitHub 社区文档完善和 README 优化来增加项目曝光率

**Architecture:** 优化 package.json 配置、创建社区文档模板、完善 README 内容

**Tech Stack:** Markdown, JSON, GitHub Templates

---

## 文件结构

```
wechat-mimocode/
├── .github/
│   ├── ISSUE_TEMPLATE/
│   │   ├── bug_report.md
│   │   └── feature_request.md
│   └── PULL_REQUEST_TEMPLATE.md
├── CONTRIBUTING.md
├── README.md
└── package.json
```

---

### Task 1: 优化 package.json

**Covers:** [S2]

**Files:**
- Modify: `package.json`

- [ ] **Step 1: 优化 keywords 字段**

```json
{
  "keywords": [
    "wechat",
    "mimocode",
    "opencode",
    "claude-code",
    "bridge",
    "chat",
    "skill",
    "cli",
    "ai",
    "assistant",
    "coding",
    "developer-tools",
    "chatbot",
    "messaging"
  ]
}
```

- [ ] **Step 2: 优化 description 字段**

```json
{
  "description": "Chat with MiMoCode from WeChat - AI coding assistant bridge for personal WeChat to local MiMoCode CLI"
}
```

- [ ] **Step 3: 验证 package.json 格式**

Run: `node -e "JSON.parse(require('fs').readFileSync('package.json'))"`
Expected: 无输出（格式正确）

- [ ] **Step 4: Commit**

```bash
git add package.json
git commit -m "chore: optimize package.json keywords and description for npm SEO"
```

---

### Task 2: 创建 Issue 模板

**Covers:** [S2]

**Files:**
- Create: `.github/ISSUE_TEMPLATE/bug_report.md`
- Create: `.github/ISSUE_TEMPLATE/feature_request.md`

- [ ] **Step 1: 创建 Bug 报告模板**

```markdown
---
name: Bug 报告
about: 报告一个问题
title: '[Bug] '
labels: bug
assignees: ''
---

## 问题描述

简要描述遇到的问题。

## 复现步骤

1. 执行 '...'
2. 发送消息 '...'
3. 看到错误 '...'

## 预期行为

描述你期望的行为。

## 实际行为

描述实际发生的行为。

## 环境信息

- OS: [e.g. Windows 11, macOS 14]
- Node.js: [e.g. 18.0.0]
- wechat-mimocode: [e.g. 1.0.2]
- MiMoCode CLI: [e.g. 1.0.0]

## 日志

如果有相关日志，请粘贴在这里。

```

- [ ] **Step 2: 创建功能请求模板**

```markdown
---
name: 功能请求
about: 建议一个新功能
title: '[Feature] '
labels: enhancement
assignees: ''
---

## 功能描述

简要描述你希望添加的功能。

## 使用场景

描述这个功能的使用场景。

## 建议实现

如果你有实现建议，请在这里描述。

## 其他信息

任何其他相关信息。

```

- [ ] **Step 3: Commit**

```bash
git add .github/ISSUE_TEMPLATE/
git commit -m "docs: add GitHub issue templates for bug reports and feature requests"
```

---

### Task 3: 创建 PR 模板

**Covers:** [S2]

**Files:**
- Create: `.github/PULL_REQUEST_TEMPLATE.md`

- [ ] **Step 1: 创建 PR 模板**

```markdown
## 变更描述

简要描述这个 PR 的变更。

## 变更类型

- [ ] Bug 修复
- [ ] 新功能
- [ ] 文档更新
- [ ] 代码重构
- [ ] 其他

## 测试

描述你如何测试这些变更。

## 相关 Issue

关联的 Issue 编号。

## 检查清单

- [ ] 代码遵循项目风格
- [ ] 已添加必要的测试
- [ ] 已更新相关文档
- [ ] 所有测试通过
```

- [ ] **Step 2: Commit**

```bash
git add .github/PULL_REQUEST_TEMPLATE.md
git commit -m "docs: add GitHub pull request template"
```

---

### Task 4: 创建贡献指南

**Covers:** [S2]

**Files:**
- Create: `CONTRIBUTING.md`

- [ ] **Step 1: 创建贡献指南**

```markdown
# 贡献指南

感谢你对 wechat-mimocode 项目的关注！

## 如何贡献

### 报告问题

使用 [Issue 模板](https://github.com/Mou-1205/wechat-mimocode/issues/new/choose) 报告问题。

### 提交代码

1. Fork 项目
2. 创建功能分支 (`git checkout -b feature/your-feature`)
3. 提交变更 (`git commit -m 'feat: add your feature'`)
4. 推送到分支 (`git push origin feature/your-feature`)
5. 创建 Pull Request

### 开发环境

```bash
# 克隆项目
git clone https://github.com/Mou-1205/wechat-mimocode.git
cd wechat-mimocode

# 安装依赖
npm install

# 开发模式
npm run dev

# 构建
npm run build
```

### 代码规范

- 使用 TypeScript
- 遵循现有代码风格
- 添加必要的注释
- 编写测试

### 提交规范

使用 [Conventional Commits](https://www.conventionalcommits.org/) 规范：

- `feat:` 新功能
- `fix:` Bug 修复
- `docs:` 文档更新
- `style:` 代码格式
- `refactor:` 重构
- `test:` 测试
- `chore:` 构建/工具

## 联系方式

如有问题，请通过 Issue 联系。
```

- [ ] **Step 2: Commit**

```bash
git add CONTRIBUTING.md
git commit -m "docs: add contributing guide"
```

---

### Task 5: 完善 README 安装指南

**Covers:** [S2]

**Files:**
- Modify: `README.md`

- [ ] **Step 1: 完善安装指南部分**

在 README.md 的 "快速安装" 部分添加更详细的说明：

```markdown
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
```

- [ ] **Step 2: Commit**

```bash
git add README.md
git commit -m "docs: enhance installation guide with multiple package managers"
```

---

### Task 6: 添加 FAQ 部分

**Covers:** [S2]

**Files:**
- Modify: `README.md`

- [ ] **Step 1: 添加 FAQ 部分**

在 README.md 末尾添加 FAQ：

```markdown
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
```

- [ ] **Step 2: Commit**

```bash
git add README.md
git commit -m "docs: add FAQ section to README"
```

---

## 验证清单

- [ ] package.json 格式正确
- [ ] Issue 模板创建成功
- [ ] PR 模板创建成功
- [ ] CONTRIBUTING.md 创建成功
- [ ] README 安装指南完善
- [ ] README FAQ 添加成功
- [ ] 所有文件已提交
