# MiniClaw 贡献指南

[English version](./CONTRIBUTING.md)

感谢你对 MiniClaw 的关注！以下是参与贡献的完整指南。

## 参与方式

- **报告 Bug** — [提交 Issue](https://github.com/augmentedmike/miniclaw-os/issues/new?template=bug_report.md)（中英文均可）
- **建议新功能** — [提交功能请求](https://github.com/augmentedmike/miniclaw-os/issues/new?template=feature_request.md)
- **提出插件想法** — [提交插件建议](https://github.com/augmentedmike/miniclaw-os/issues/new?template=plugin_idea.md)
- **修复 Bug 或添加功能** — Fork 仓库，创建分支，提交 PR
- **改进文档** — Wiki、README、插件文档的翻译和完善
- **参与讨论** — [GitHub Discussions](https://github.com/augmentedmike/miniclaw-os/discussions)

## 使用 MiniClaw 协助贡献

MiniClaw 本身就是用 MiniClaw 构建的。如果你已安装 MiniClaw，你的代理可以协助你完成贡献流程。

### 创建贡献任务

```bash
mc board create "为 mc-rolodex 添加模糊搜索功能" --priority medium --tags contribution
```

你的代理会自动填写实施计划和验收标准，然后开始工作。你只需审查和批准。

### 研究代码库

```bash
# 让代理在修改前先理解某个插件
openclaw agent "阅读 mc-board 插件并解释其状态机转换逻辑"

# 搜索知识库中的相关内容
mc kb search "rolodex search"
```

### 构建新插件

```bash
# 让代理为你搭建插件脚手架
openclaw agent "参照 plugins/mc-kb 的结构，创建一个名为 mc-weather 的新插件"

# 或使用看板追踪完整的构建过程
mc board create "构建 mc-weather 插件" --priority high
```

代理会参照 [插件开发指南](https://github.com/augmentedmike/miniclaw-os/wiki/Writing-Plugins) 创建文件并进行测试。

### 生成 PR

```bash
# 代理可以根据任务卡片自动起草 PR 描述
openclaw agent "基于卡片 crd_abc123 为 mc-weather 插件创建 PR"
```

### 运行安全检查

```bash
# 代理通常会自动执行，你也可以手动运行
openclaw agent "对整个仓库运行安全检查并修复问题"
```

预提交钩子会在每次提交时自动运行 `scripts/security-check.sh`。代理会遵守这一规则 — 包含密钥的提交会被阻止。

### 利用 mc-kb 从历史贡献中学习

每当代理完成一个任务卡片，经验教训都会保存到 mc-kb。在开始贡献前，先搜索已有的经验：

```bash
mc kb search "插件开发"
mc kb search "常见错误"
```

---

## Issue 驱动开发

每次变更都遵循以下流程，无一例外。

```
Issue → 分支 → 开发 → 提交 → PR → CI → 合并 → 关闭
```

### Issue 就是契约

Issue 定义了要做什么。不多也不少。这是代理和人类保持一致的方式 — Issue 约束范围、防止偏离、创建可审计的记录。

- **无 Issue 不工作。** 如果没有 Issue，先创建一个。
- **Issue 是唯一的真实来源。** 范围变更请更新 Issue。遇到阻碍请在 Issue 上评论。有新发现请补充到 Issue。
- **以决议关闭。** 记录完成了什么、哪些文件变更了、如何验证。

### 分支命名规范

```bash
git checkout -b fix/32-credentials-save-failing
git checkout -b feat/34-mc-github-plugin
git checkout -b chore/35-branch-workflow
```

约定：`fix/`、`feat/`、`chore/`、`docs/` 前缀 + Issue 编号 + 简短描述。

### 提交关联 Issue

```bash
git commit -m "fix: vault init before credential persist

Resolves #32"
```

### PR 链接到 Issue

在 PR 正文中使用 `Fixes #N`，这样合并时 Issue 会自动关闭。

### CI 必须通过

测试套件在 `stable` 标签上运行。所有测试必须通过才能标记 stable。

---

## 编码规范

遵循 [CODING_AXIOMS.md](./CODING_AXIOMS.md) — 基于函数式编程、组合和清晰性的语言无关原则。

核心准则：失败要响亮、三行代码胜过一层抽象、声明式优于命令式、副作用放在边界、删除而非弃用、测试验证行为而非覆盖率。

**运行时：仅限 Node.js。** 不使用 Bun。不允许 `bun:*` 导入、`Bun.serve()`、`bun:sqlite`、`bun:test`。使用 `better-sqlite3`、`vitest`、`node:fs`、`npm install -g`、`npx tsx`。

**文件命名：** 仅使用 kebab-case。`setup-wizard.tsx` 而非 `SetupWizard.tsx`。

---

## 本地开发环境搭建

```bash
git clone https://github.com/augmentedmike/miniclaw-os.git
cd miniclaw-os
```

### OpenClaw Fork 解析

MiniClaw 插件通过 `package.json` 中的 `file:` 引用从**本地 Fork** 解析 `openclaw`，而非 npm 注册表。这确保你始终使用与开发版本一致的 openclaw 核心。

```bash
# 将 Fork 克隆为 miniclaw-os 的同级目录
git clone https://github.com/augmentedmike/openclaw.git ../openclaw
```

每个插件的 `devDependencies` 声明：

```json
"openclaw": "file:../../../openclaw"
```

`npm install` 后，`node_modules/openclaw` 将指向 Fork 目录的符号链接。

预提交钩子（`scripts/security-check.sh`）在每次提交时自动运行。它会扫描硬编码的密钥、API key 和个人信息。请不要绕过它。

## PR 流程

1. Fork 仓库，从 `main` 创建分支
2. 进行修改
3. 运行 `./scripts/security-check.sh --all` 确认无密钥泄露
4. 使用模板提交 PR
5. 等待审查

## 编写插件

参见 [插件开发指南](https://github.com/augmentedmike/miniclaw-os/wiki/Writing-Plugins) Wiki 页面。

基本结构：

```
plugins/mc-my-plugin/
├── openclaw.plugin.json
├── package.json
├── index.ts
├── tools/
└── cli/
```

## 安全

请勿提交密钥、API key、令牌或个人信息。预提交钩子会阻止，但请注意防范。如发现安全问题，请通过邮件联系维护者，不要公开提 Issue。

## 代码风格

- 使用 TypeScript 编写插件
- 保持简洁 — 不过度工程化
- 一个插件，一个职责
- 测试你的修改

## 许可证

参与贡献即表示你同意你的贡献将在 Apache 2.0 许可证下发布。
