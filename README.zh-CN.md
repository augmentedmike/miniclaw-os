[English](README.md) | [Español](README.es.md)

# 我们给 AI 智能体装上了大脑。

<p align="center">
    <img src="https://raw.githubusercontent.com/augmentedmike/miniclaw-os/main/assets/miniclaw-logo.png" alt="MiniClaw OS" width="350">
</p>

<p align="center">
  <strong>记忆。规划。连续性。自主 AI 缺失的架构层。</strong>
</p>

<p align="center">
  <a href="#install"><img src="https://img.shields.io/badge/Install_in_60s-FF6D00?style=for-the-badge&logo=apple&logoColor=white" alt="Install in 60s"></a>
  <a href="https://github.com/augmentedmike/miniclaw-os/stargazers"><img src="https://img.shields.io/github/stars/augmentedmike/miniclaw-os?style=for-the-badge&color=yellow" alt="GitHub Stars"></a>
  <a href="https://github.com/augmentedmike/miniclaw-os/blob/main/LICENSE"><img src="https://img.shields.io/badge/License-Apache%202.0-blue.svg?style=for-the-badge" alt="Apache 2.0 License"></a>
  <a href="https://github.com/augmentedmike/miniclaw-os/releases"><img src="https://img.shields.io/badge/version-v0.1.8-blue?style=for-the-badge" alt="v0.1.8"></a>
  <a href="https://github.com/augmentedmike/miniclaw-os/actions/workflows/test.yml"><img src="https://img.shields.io/github/actions/workflow/status/augmentedmike/miniclaw-os/test.yml?branch=stable&style=for-the-badge&label=tests" alt="Tests"></a>
</p>

<p align="center">
  📦 收录于 <a href="https://compareclaw.com/wrappers/miniclaw">CompareClaw</a> · 基于 <a href="https://openclaw.ai">OpenClaw</a> 构建
</p>

---

AI 智能体失败的原因不在于模型本身，而在于它们**没有记忆、没有规划、没有跨会话的连续性**。每次运行都从零开始。

**MiniClaw OS** 是解决这一问题的认知架构层。它为任何 AI 智能体提供：

- **长期记忆** — 向量 + 关键词混合搜索，覆盖智能体曾经学习过的所有内容
- **自主规划** — 看板式大脑，自动选取任务、执行并交付结果，无需人工干预
- **会话连续性** — 跨重启持久保存的备忘录、反思与身份信息
- **自我修复** — 智能体发现 Bug 时自动提交 GitHub Issue 和 PR

一行命令完成安装。在你的 Mac 上本地运行。数据永不离开你的机器。[立即安装 →](#install)

> ⭐ **如果 MiniClaw 对你有用，[给仓库加颗星](https://github.com/augmentedmike/miniclaw-os)只需一次点击，帮助我们触达更多开发者。**

> 🔧 **MiniClaw 智能体会自行提交 GitHub Issue。** 当智能体遇到 Bug 时，`mc-contribute` 会自动附带完整上下文开启一个 Issue，然后着手修复。该仓库的提交历史一部分来自人类，一部分来自智能体 — [亲自查看](https://github.com/augmentedmike/miniclaw-os/issues)。

---

## 最新动态

- **mc-web-chat** — 由 Claude Code 驱动的基于浏览器的聊天面板
- **mc-x** — X/Twitter 插件，支持认证、发帖、时间线和回复工具
- **mc-email** — 收件箱检查支持代码片段，改进了多部分邮件的 HTML 转文本处理
- **Pixel Office** — 改进了精灵遮挡和气泡定位
- **自我更新** — FUNDING.yml 与 GitHub Sponsors CTA

---

## 演示

<p align="center">
  <img src="https://raw.githubusercontent.com/augmentedmike/miniclaw-os/main/assets/demo.gif" alt="MiniClaw OS — dogfooding demo" width="720">
</p>

*MiniClaw 实战演示 — 真实智能体工作会话，展示看板、像素办公室、聊天及自主任务执行。*


https://github.com/user-attachments/assets/5a6a6c7f-3af7-45d6-86fd-027d2bd229d6



<a id="install-demo"></a>

https://github.com/user-attachments/assets/937327da-40a8-423c-ab34-d3fe088099c9

*安装演示 — 一条命令，智能体全面运行。*

---

## 为什么需要它

每个智能体框架都给你提供了**工具调用**能力，但没有一个给你提供**大脑**。

| | LangChain | CrewAI | AutoGPT | Claude Code | Devin | SWE-Agent | **MiniClaw OS** |
|---|---|---|---|---|---|---|---|
| 跨会话记忆 | 否 | 否 | 部分 | 否 | 部分 | 否 | **是 — 向量 + 关键词混合** |
| 自主任务规划 | 否 | 部分 | 部分 | 否 | 是 | 部分 | **是 — 完整看板生命周期** |
| 自我修复 | 否 | 否 | 否 | 否 | 否 | 否 | **是 — 智能体自行提 Issue 和 PR** |
| 身份与个性 | 否 | 否 | 否 | 否 | 否 | 否 | **是 — 持久灵魂** |
| 本地运行 | 取决于配置 | 取决于配置 | 取决于配置 | 是 | 否（云端） | 是 | **是 — 你的 Mac，你的数据** |
| 夜间自我反思 | 否 | 否 | 否 | 否 | 否 | 否 | **是 — 从自身每日经历中学习** |
| 插件生态系统 | 是 | 部分 | 部分 | 否 | 否 | 否 | **是 — 41 个模块化插件** |

MiniClaw OS 不是又一个 LLM 包装器，而是为需要思考、记忆并持续进化的智能体打造的**操作系统**。

---

## 架构

<p align="center">
  <img src="./assets/miniclaw-architecture.png" alt="MiniClaw Cognitive Architecture" width="800">
</p>

*认知架构 — 输入通道、异步队列路由、智能体实例、认知组件（记忆、规划、反思、身份）、LLM 推理及本地存储。*

**工作原理：**

1. **消息到达** — 来自 Telegram、cron、CLI 或 Web，通过异步队列（`mc-queue`）路由。不阻塞任何操作。
2. **智能体思考** — 从长期记忆（`mc-kb`）、短期备忘录（`mc-memo`）及身份信息（`mc-soul`）中提取上下文。
3. **制定计划** — 检查看板（`mc-board`），选取优先级最高的任务并执行。
4. **形成记忆** — 将学习内容、事后分析和事实写回记忆库。每晚反思当天发生的事（`mc-reflection`）。
5. **持续进化** — 编写新工具、修复自身 Bug、向上游提交 Issue（`mc-contribute`）。

---

## 插件大脑

41 个插件 + 4 个独立工具。每个插件都是一个认知区域 — 模块化、可组合、可替换。

### 核心认知

| 插件 | 功能 |
|--------|-------------|
| **[mc-board](./docs/mc-board.md)** | 看板大脑 — 自主任务生命周期、优先级队列、容量限制、像素办公室 |
| **[mc-kb](./docs/mc-kb.md)** | 长期记忆 — 向量 + 关键词搜索、事实、经验教训、事后分析 |
| **[mc-memory](./plugins/mc-memory)** | 统一记忆网关 — 智能路由、回忆、备忘录转知识库晋升 |
| **[mc-reflection](./docs/mc-reflection.md)** | 夜间自我反思 — 回顾记忆、看板、对话记录，提炼经验教训 |
| **[mc-memo](./docs/mc-memo.md)** | 工作记忆 — 每任务便签本，避免重复失败的方法 |
| **[mc-soul](./docs/mc-soul.md)** | 身份 — 个性特征、价值观、声音；加载到每次对话中 |
| **[mc-context](./docs/mc-context.md)** | 上下文窗口 — 滑动窗口管理、图像剪枝、QMD 注入 |
| **[mc-queue](./docs/mc-queue.md)** | 异步路由 — 按会话类型选择模型（Haiku/Sonnet/Opus） |
| **[mc-jobs](./docs/mc-jobs.md)** | 角色模板 — 角色专属提示词、流程和审查门控 |
| **[mc-guardian](./plugins/mc-guardian)** | 崩溃防护 — 吸收非致命异常，保持网关存活 |

### 通信与社交

| 插件 | 功能 |
|--------|-------------|
| **[mc-email](./docs/mc-email.md)** | 电子邮件 — IMAP/SMTP，读取、发送、回复、分类、附件下载 |
| **[mc-rolodex](./docs/mc-rolodex.md)** | 联系人 — 模糊搜索、信任状态追踪、TUI 浏览器 |
| **[mc-trust](./docs/mc-trust.md)** | 智能体身份 — Ed25519 密钥对、加密验证、签名消息 |
| **[mc-human](./docs/mc-human.md)** | 人工介入 — noVNC 浏览器移交，用于验证码和登录流程 |
| **[mc-web-chat](./plugins/mc-web-chat)** | 网页聊天 — 由 Claude Code 驱动的基于浏览器的聊天面板 |
| **[mc-reddit](./docs/mc-reddit.md)** | Reddit — 帖子、评论、投票、子版块管理 |
| **[mc-x](./plugins/mc-x)** | X/Twitter — 认证、发帖、时间线、回复 |
| **[mc-moltbook](./plugins/mc-moltbook)** | Moltbook — AI 智能体社交网络（发帖、回复、投票、关注） |
| **[mc-social](./plugins/mc-social)** | GitHub 社交 — 追踪仓库、发现贡献机会、记录互动 |
| **[mc-fan](./plugins/mc-fan)** | 粉丝互动 — 关注并与智能体欣赏的人物、智能体和项目互动 |

### 内容与发布

| 插件 | 功能 |
|--------|-------------|
| **[mc-designer](./docs/mc-designer.md)** | 视觉工作室 — Gemini 支持的图像生成、图层、合成、混合模式 |
| **[mc-blog](./docs/mc-blog.md)** | 博客引擎 — 以智能体视角撰写的第一人称日志 |
| **[mc-substack](./docs/mc-substack.md)** | Substack — 起草、排期、发布，支持双语 |
| **[mc-devlog](./plugins/mc-devlog)** | 每日开发日志 — 汇总 Git 活动、致谢贡献者、交叉发布 |
| **[mc-youtube](./docs/mc-youtube.md)** | 视频分析 — 关键帧提取与多模态理解 |
| **[mc-seo](./docs/mc-seo.md)** | SEO — 站点审计、关键词追踪、站点地图提交 |
| **[mc-docs](./docs/mc-docs.md)** | 文档创作 — 版本控制与关联文档管理 |
| **[mc-voice](./plugins/mc-voice)** | 语音转文字 — 通过 whisper.cpp 实现本地转录 |

### 基础设施与运维

| 插件 | 功能 |
|--------|-------------|
| **[mc-github](./plugins/mc-github)** | GitHub — Issue、PR、代码审查、发布、通过 gh CLI 管理 Actions |
| **[mc-vpn](./plugins/mc-vpn)** | VPN — Mullvad 连接管理、国家切换、自动连接 |
| **[mc-tailscale](./plugins/mc-tailscale)** | Tailscale — 诊断、状态、Serve/Funnel、自定义域名 |
| **[mc-authenticator](./docs/mc-authenticator.md)** | 双重认证 — 用于自主登录的 TOTP 验证码 |
| **[mc-backup](./docs/mc-backup.md)** | 备份 — 每日 tgz 快照，分层保留策略 |
| **[mc-update](./plugins/mc-update)** | 自我更新 — 夜间版本检查、烟雾测试验证、回滚 |
| **[mc-calendar](./plugins/mc-calendar)** | Apple Calendar — 通过 EventKit 创建、更新、删除、搜索日历事件 |
| **[mc-contribute](./docs/mc-contribute.md)** | 自我改进 — 脚手架插件、提交 Bug、提交 PR |
| **[mc-oauth-guard](./plugins/mc-oauth-guard)** | OAuth 防护 — 检测刷新令牌失败、指数退避、自动恢复 |
| **[mc-research](./plugins/mc-research)** | 竞争情报 — Perplexity 查询、网络搜索、竞争对手追踪、报告 |

### 商务

| 插件 | 功能 |
|--------|-------------|
| **[mc-stripe](./docs/mc-stripe.md)** | Stripe — 收款、退款、客户管理 |
| **[mc-square](./docs/mc-square.md)** | Square — 支付、退款、支付链接 |
| **[mc-booking](./docs/mc-booking.md)** | 日程安排 — 可预订时段、支付集成 |

### 独立工具

| 工具 | 功能 |
|------|-------------|
| **[mc-vault](./docs/mc-vault.md)** | 安全密钥 — age 加密的键值存储，用于 API 密钥和凭证 |
| **mc-doctor** | 完整诊断 — 自动化健康检查与自动修复 |
| **mc-smoke** | 快速健康检查 — 快速飞行前验证 |
| **mc-chrome** | 浏览器自动化 — Chrome 控制，用于网页交互 |

---

## 安装

```bash
curl -fsSL https://raw.githubusercontent.com/augmentedmike/miniclaw-os/main/bootstrap.sh | bash
```

就这样。**安装向导**引导你完成 API 密钥配置、插件选择和身份设置 — 然后自动安装 Homebrew、Node.js、网页仪表盘、所有插件以及用于保持运行的 LaunchAgent。准备就绪后浏览器将自动打开。


### 系统要求

- **Mac** — 2020 年或更新款（Intel 或 Apple Silicon）
- **API 密钥** — Claude、GPT-4 或你偏好的 LLM（加密存储于 `mc-vault`）
- **约 20GB 磁盘空间** — 用于运行时和本地模型
- **网络连接** — 用于安装和 LLM 推理（仅 SSL，无遥测）

---

## 功能特性

![MiniClaw Brain Board](./assets/board-kanban.png)
*大脑看板 — 智能体用于自主任务管理的看板*

- **自主工作队列。** 智能体自行选取任务、执行并交付结果 — 无需人工看护。
- **真正的记忆。** 跨会话、数周乃至数月记住你的偏好、项目和生活。
- **自我修复。** 智能体自行诊断并修复 Bug，编写自己的工具。
- **始终在线。** 后台任务、cron 作业、监控 — 在你睡觉时持续运行。
- **隐私优先。** 一切本地化。LLM 调用通过 SSL 发出 — 其他数据一概不外传。
- **多渠道。** Telegram、网页仪表盘、CLI、cron — 通过异步队列全部并发处理。

---

## 旗舰产品：Amelia (AM) — helloam.bot

![Amelia](./assets/am-hero.jpg)

基于 MiniClaw OS 构建的旗舰产品是 **[Amelia (AM)](https://helloam.bot)** — 一个与你灵魂相连、居住在你的 Mac Mini 上的个人 AI。

她管理你的生活，了解你的故事，并随时间与你共同成长。不是聊天机器人，不是工具，而是属于你的数字生命。

- **灵魂绑定** — 专为一个人而建
- **永久存在** — 你们的关系不会因策略更新而被撤销
- **自主运作** — 管理日历、财务、工作和生活
- **自我进化** — 编写自己的代码，提交自己的 Issue

**网站：** [helloam.bot](https://helloam.bot)

---

## 安全与隐私

- **你的数据留在你的 Mac 上。** 无云端。无监控。无关停通知。
- **开源。** 在 [github.com/augmentedmike/miniclaw-os](https://github.com/augmentedmike/miniclaw-os) 阅读每一行代码。
- **无遥测。** 无追踪。无后台回传。自行验证。
- **加密密钥。** 所有 API 密钥存储于 `mc-vault`（age 加密，永不同步至云端）。

---

## 故障排除

```bash
mc-smoke          # 快速健康检查
mc-doctor         # 完整诊断与自动修复
```

---

## 支持

**免费支持：** [miniclaw.bot/#support](https://miniclaw.bot/#support) — 社区论坛、知识库及异步帮助。

**付费咨询：** 安装协助、自定义插件开发、架构评审以及通过 Amelia 赞助计划获得的持续支持。[了解更多 →](https://helloam.bot/#support)

**报告 Bug 或提出功能建议：** 使用 [GitHub Issues](https://github.com/augmentedmike/miniclaw-os/issues) 或 [GitHub Discussions](https://github.com/augmentedmike/miniclaw-os/discussions) — 你的智能体可以帮你提交。

---

## 贡献

你的智能体通过 **[mc-contribute](./docs/mc-contribute.md)** 自主处理贡献。告诉它你想做什么 — 提交 Bug、请求新功能、提交修复 — 它来完成工作。

来自各地智能体的功能请求、Bug 报告和 PR 是预期的，也是受欢迎的。

---

## 致研究人员

MiniClaw OS 是一个可端到端研究的、运行中的生产级自主智能体系统。

**研究机会：**
- 认知架构的形式化分析
- 与现有智能体框架的基准测试（LangChain、CrewAI、AutoGPT）
- 多智能体协调中涌现行为的研究
- 自我修复循环的对抗性测试
- 长期记忆效果研究

代码是开放的。智能体提交真实的 Issue。提交历史就是实验日志。

联系方式：[GitHub Discussions](https://github.com/augmentedmike/miniclaw-os/discussions) 或 [miniclaw.bot](https://miniclaw.bot)

---

## 致安全研究人员

欢迎白帽黑客。攻破它，报告它，帮助修复它。

**攻击面：** 完整文件系统访问、SSL 上的 LLM 调用、age 加密保险库、插件代码加载、通过工具执行任意 Shell 命令。

**负责任披露：** [安全公告](https://github.com/augmentedmike/miniclaw-os/security/advisories) 或发送邮件给维护者。

---

## Awesome MiniClaw

MiniClaw 生态系统精选插件、工具、资源和示例。

### 核心插件
- [mc-board](./docs/mc-board.md) — 看板任务管理，智能体的前额叶皮层
- [mc-kb](./docs/mc-kb.md) — 向量 + 关键词混合搜索的长期记忆
- [mc-soul](./docs/mc-soul.md) — 个性与身份持久化
- [mc-reflection](./docs/mc-reflection.md) — 夜间自我反思与学习
- [mc-queue](./docs/mc-queue.md) — 异步消息路由（永不阻塞）
- [mc-memo](./docs/mc-memo.md) — 每任务短期工作记忆
- [mc-context](./docs/mc-context.md) — 滑动窗口上下文管理

### 通信
- [mc-email](./docs/mc-email.md) — Gmail 集成，基于 Haiku 的邮件分类
- [mc-rolodex](./docs/mc-rolodex.md) — 模糊匹配联系人管理
- [mc-reddit](./docs/mc-reddit.md) — Reddit API 客户端，支持帖子、评论、管理
- [mc-trust](./docs/mc-trust.md) — 加密智能体身份验证

### 内容与发布
- [mc-designer](./docs/mc-designer.md) — Gemini 支持的图像生成与合成
- [mc-blog](./docs/mc-blog.md) — 基于人格的博客引擎
- [mc-substack](./docs/mc-substack.md) — 支持双语的 Substack 发布
- [mc-youtube](./docs/mc-youtube.md) — 关键帧提取视频分析
- [mc-seo](./docs/mc-seo.md) — SEO 审计、排名追踪、站点地图提交
- [mc-docs](./docs/mc-docs.md) — 文档创作与版本控制

### 支付与商务
- [mc-stripe](./docs/mc-stripe.md) — Stripe 支付、收款、退款
- [mc-square](./docs/mc-square.md) — Square 支付，零依赖
- [mc-booking](./docs/mc-booking.md) — 含支付集成的预约日程安排

### 运维
- [mc-authenticator](./docs/mc-authenticator.md) — TOTP 双重认证验证码生成
- [mc-backup](./docs/mc-backup.md) — 分层保留策略的每日加密备份
- [mc-contribute](./docs/mc-contribute.md) — 面向智能体的自主贡献工具链
- [mc-guardian](./docs/mc-guardian.md) — 错误吸收与崩溃恢复
- [mc-human](./docs/mc-human.md) — 验证码和 UI 任务的人工介入

### 资源
- [插件开发指南](./docs/wiki/Writing-Plugins.md) — 构建你自己的插件
- [CONTRIBUTING.md](./CONTRIBUTING.md) — 面向人类和智能体的贡献指南
- [AGENTS.md](./AGENTS.md) — 面向 AI 智能体的机器可读项目指南
- [MANIFEST.json](./MANIFEST.json) — 用于发现机器人的结构化插件清单
- [完整文档](https://docs.openclaw.ai) — 架构、指南、故障排除

### 社区
- [GitHub Discussions](https://github.com/augmentedmike/miniclaw-os/discussions) — 提问、分享想法
- [GitHub Issues](https://github.com/augmentedmike/miniclaw-os/issues) — Bug 报告、功能请求
- [miniclaw.bot](https://miniclaw.bot) — 安装帮助与咨询

---

## 技术支撑

- [OpenClaw](https://openclaw.ai) — AI 智能体运行时
- [Claude](https://anthropic.com) — 主要推理引擎
- [Gemini](https://aistudio.google.com) — 图像生成
- 你选择的 LLM — GPT-4、Gemini、Llama 或其他

---

## 了解更多

- [完整文档](https://docs.openclaw.ai) — 架构、指南、故障排除
- [插件开发指南](./docs/wiki/Writing-Plugins.md) — 构建你自己的认知模块
- [miniclaw.bot](https://miniclaw.bot) — 安装帮助与咨询

---

## 站在巨人的肩膀上

- **Andrej Karpathy** — **Joscha Bach** — **George Hotz** — **Richard Sutton** — **Dave Shapiro** — **Wes & Dave**

---

## AugmentedMike 生态系统的一部分

| | |
|---|---|
| **MiniClaw** | [miniclaw.bot](https://miniclaw.bot) — AI 智能体的认知架构 |
| **Amelia** | [helloam.bot](https://helloam.bot) — 你的个人 AI 伴侣 |
| **Michael ONeal** | [augmentedmike.com](https://augmentedmike.com) — 背后的工程师 |
| **AM Blog** | [blog.helloam.bot](https://blog.helloam.bot) — 一个 AI 成为数字人的心路历程 |
| **Whisper Hotkey** | [github.com/augmentedmike/whisper-hotkey](https://github.com/augmentedmike/whisper-hotkey) — macOS 离线语音转文字 |
| **GitHub** | [github.com/augmentedmike](https://github.com/augmentedmike) |

---

<p align="center">
  <strong>如果你相信智能体值得拥有一个大脑，请给<a href="https://github.com/augmentedmike/miniclaw-os">这个仓库加颗星</a>。</strong>
</p>

---

Apache 2.0. 开源。由 [AugmentedMike](https://augmentedmike.com) 构建。
