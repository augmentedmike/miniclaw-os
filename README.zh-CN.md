[English](README.md) | [Español](README.es.md)

# miniclaw-os — 轻量级自主代理操作系统

<p align="center">
    <img src="https://raw.githubusercontent.com/augmentedmike/miniclaw-os/main/assets/miniclaw-logo.png" alt="MiniClaw OS" width="350">
</p>

<p align="center">
  <strong>可持续运行、自我优化的智能代理系统 — 为自主 AI 补齐记忆、规划与连续性。</strong>
</p>

<p align="center">
  <code>AI代理</code> · <code>自动化系统</code> · <code>操作系统</code> · <code>开发框架</code> · <code>智能体框架</code> · <code>认知架构</code> · <code>自主AI</code>
</p>

<p align="center">
  <a href="#install"><img src="https://img.shields.io/badge/Install_in_60s-FF6D00?style=for-the-badge&logo=apple&logoColor=white" alt="60 秒安装"></a>
  <a href="https://github.com/augmentedmike/miniclaw-os/stargazers"><img src="https://img.shields.io/github/stars/augmentedmike/miniclaw-os?style=for-the-badge&color=yellow" alt="GitHub Stars"></a>
  <a href="https://github.com/augmentedmike/miniclaw-os/blob/main/LICENSE"><img src="https://img.shields.io/badge/License-Apache%202.0-blue.svg?style=for-the-badge" alt="Apache 2.0 License"></a>
  <a href="https://github.com/augmentedmike/miniclaw-os/releases"><img src="https://img.shields.io/badge/version-v0.1.9--prerelease-blue?style=for-the-badge" alt="v0.1.9-prerelease"></a>
  <a href="https://github.com/augmentedmike/miniclaw-os/actions/workflows/test.yml"><img src="https://img.shields.io/github/actions/workflow/status/augmentedmike/miniclaw-os/test.yml?branch=stable&style=for-the-badge&label=tests" alt="Tests"></a>
</p>

<p align="center">
  📦 收录于 <a href="https://compareclaw.com/wrappers/miniclaw">CompareClaw</a> · 基于 <a href="https://openclaw.ai">OpenClaw</a> 构建
</p>

---

## 为什么现有的 AI 代理都不够用

当前的 AI 代理方案有一个共同的致命缺陷：**每次运行都从零开始**。没有跨会话的记忆，没有自主规划的能力，没有连续运行的机制。模型本身并不是瓶颈，真正的瓶颈在于缺少一个让代理持续思考、持续进化的**认知架构层**。

**MiniClaw OS** 正是为解决这一工程问题而生的操作系统。它不是又一个 LLM 包装器，而是一套完整的认知基础设施，为任何 AI 代理提供四大核心能力：

- **长期记忆** — 采用向量 + 关键词混合检索，代理能够检索曾经学习过的一切知识。无论是用户偏好、项目上下文还是历史经验教训，都以结构化方式永久存储，跨会话可用。
- **自主规划** — 内置看板式任务大脑，代理自动从任务队列中选取优先级最高的工作，执行完毕后自动交付结果。无需人工指派，真正实现 7×24 小时自主运行。
- **会话连续性** — 工作备忘录、自我反思和身份信息跨重启持久保存。代理不会因为一次重启就"失忆"，每次启动都自动恢复此前的工作状态。
- **自我修复** — 代理发现 Bug 时能够自动提交 GitHub Issue 并尝试修复。它不仅使用工具，还能编写自己的工具，实现真正的自我进化。

一行命令即可完成安装，在你的 Mac 上本地运行，数据永不离开你的机器。[立即安装 →](#install)

> ⭐ **如果 MiniClaw 对你的工程实践有帮助，[给仓库加颗星](https://github.com/augmentedmike/miniclaw-os)帮助我们触达更多开发者。**

> 🔧 **MiniClaw 代理会自主参与开源协作。** 当代理遇到 Bug 时，`mc-contribute` 插件会自动创建带有完整上下文的 Issue，然后着手修复。该仓库的提交历史一部分来自人类工程师，一部分来自自主代理 — [查看真实提交记录](https://github.com/augmentedmike/miniclaw-os/issues)。

---

## 最新动态

- **mc-web-chat** — 由 Claude Code 驱动的浏览器端聊天界面
- **mc-x** — X/Twitter 插件，支持认证、发帖、时间线和回复
- **mc-email** — 收件箱检查支持代码片段，改进了多部分邮件的 HTML 转文本处理
- **Pixel Office** — 改进了精灵遮挡和气泡定位
- **自我更新** — FUNDING.yml 与 GitHub Sponsors CTA

---

## 演示

<p align="center">
  <img src="https://raw.githubusercontent.com/augmentedmike/miniclaw-os/main/assets/demo.gif" alt="MiniClaw OS — dogfooding demo" width="720">
</p>

*MiniClaw 实战演示 — 真实代理工作会话，展示看板、像素办公室、聊天及自主任务执行。*


https://github.com/user-attachments/assets/5a6a6c7f-3af7-45d6-86fd-027d2bd229d6



<a id="install-demo"></a>

https://github.com/user-attachments/assets/937327da-40a8-423c-ab34-d3fe088099c9

*安装演示 — 一条命令，代理全面运行。*

---

## 与现有方案的工程对比

市面上的代理框架提供了**工具调用**能力，但没有一个提供**持续运行的认知架构**。以下是 MiniClaw OS 与主流方案的核心差异：

| 能力 | LangChain | CrewAI | AutoGPT | Claude Code | Devin | SWE-Agent | **MiniClaw OS** |
|---|---|---|---|---|---|---|---|
| 跨会话长期记忆 | ✗ | ✗ | 部分 | ✗ | 部分 | ✗ | **✓ 向量 + 关键词混合检索** |
| 自主任务规划与执行 | ✗ | 部分 | 部分 | ✗ | ✓ | 部分 | **✓ 完整看板生命周期** |
| 自我诊断与修复 | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | **✓ 自动提 Issue 和 PR** |
| 身份与连续性 | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | **✓ 持久化人格与记忆** |
| 完全本地运行 | 视配置 | 视配置 | 视配置 | ✓ | ✗（云端） | ✓ | **✓ 数据不出本机** |
| 夜间自我反思学习 | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | **✓ 从每日经历中提炼经验** |
| 模块化插件生态 | ✓ | 部分 | 部分 | ✗ | ✗ | ✗ | **✓ 41 个可组合插件** |

MiniClaw OS 不是在已有 LLM 上叠加一层薄薄的 API 调用，而是为需要**持续思考、持续记忆、持续进化**的代理打造的完整操作系统。

---

## 架构

<p align="center">
  <img src="./assets/miniclaw-architecture.png" alt="MiniClaw 认知架构" width="800">
</p>

*认知架构总览 — 输入通道、异步队列路由、代理实例、认知组件（记忆、规划、反思、身份）、LLM 推理及本地存储。*

**系统工作流程：**

1. **消息接入** — 来自 Telegram、cron 定时任务、CLI 或 Web 的请求，通过异步队列（`mc-queue`）统一路由，不阻塞任何操作。这种设计确保代理在处理耗时任务时不会错过新的输入。
2. **上下文构建** — 代理从长期记忆（`mc-kb`）检索相关知识，从短期备忘录（`mc-memo`）获取当前工作状态，并加载身份信息（`mc-soul`）以保持一致的行为模式。
3. **任务规划与执行** — 检查看板（`mc-board`），按优先级队列选取任务，制定执行计划并逐步推进。完成后自动更新任务状态。
4. **记忆形成与巩固** — 将学习到的新知识、事后分析和关键事实写回记忆库。每晚通过自我反思（`mc-reflection`）回顾当天经历，提炼规律性经验。
5. **自我进化** — 不仅完成任务，还能编写新工具、修复自身 Bug、向上游提交 Issue 和 PR（`mc-contribute`），实现持续自我优化。

---

## 插件生态

41 个插件 + 4 个独立工具。每个插件负责一个独立的认知领域 — 高度模块化，可自由组合与替换。这种设计让你可以根据实际需求灵活定制代理能力。

### 核心认知

| 插件 | 功能 |
|--------|-------------|
| **[mc-board](./docs/mc-board.md)** | 看板大脑 — 自主任务生命周期管理、优先级队列、容量限制。代理通过它实现完全自主的工作调度，无需人工指派。 |
| **[mc-kb](./docs/mc-kb.md)** | 长期记忆 — 向量 + 关键词混合搜索。存储事实、经验教训、事后分析，支持语义检索和精确匹配。 |
| **[mc-memory](./plugins/mc-memory)** | 统一记忆网关 — 智能路由查询到最合适的记忆源，自动将短期备忘录晋升为长期知识。 |
| **[mc-reflection](./docs/mc-reflection.md)** | 夜间自我反思 — 回顾当天的记忆、任务和对话记录，提炼规律性经验并写入知识库。 |
| **[mc-memo](./docs/mc-memo.md)** | 工作记忆 — 每任务便签本，记录决策过程和失败路径，避免重复踩坑。 |
| **[mc-soul](./docs/mc-soul.md)** | 身份持久化 — 个性特征、价值观、行为模式。加载到每次对话中，确保代理行为的一致性。 |
| **[mc-context](./docs/mc-context.md)** | 上下文窗口管理 — 滑动窗口、图像剪枝、QMD 注入，最大化有效上下文利用率。 |
| **[mc-queue](./docs/mc-queue.md)** | 异步路由 — 按会话类型智能选择模型（Haiku/Sonnet/Opus），平衡性能与成本。 |
| **[mc-jobs](./docs/mc-jobs.md)** | 角色模板 — 角色专属的提示词、工作流程和审查门控，让代理在不同场景下切换专业角色。 |
| **[mc-guardian](./plugins/mc-guardian)** | 崩溃防护 — 吸收非致命异常，保持网关进程存活，确保系统 7×24 小时稳定运行。 |

### 通信与社交

| 插件 | 功能 |
|--------|-------------|
| **[mc-email](./docs/mc-email.md)** | 电子邮件 — IMAP/SMTP 全功能支持，读取、发送、回复、分类、附件下载 |
| **[mc-rolodex](./docs/mc-rolodex.md)** | 联系人管理 — 模糊搜索、信任状态追踪、TUI 浏览器 |
| **[mc-trust](./docs/mc-trust.md)** | 代理身份验证 — Ed25519 密钥对、加密验证、签名消息 |
| **[mc-human](./docs/mc-human.md)** | 人工介入 — noVNC 浏览器移交，用于验证码和登录流程 |
| **[mc-web-chat](./plugins/mc-web-chat)** | 网页聊天 — 由 Claude Code 驱动的浏览器端聊天界面 |
| **[mc-reddit](./docs/mc-reddit.md)** | Reddit — 帖子、评论、投票、子版块管理 |
| **[mc-x](./plugins/mc-x)** | X/Twitter — 认证、发帖、时间线、回复 |
| **[mc-moltbook](./plugins/mc-moltbook)** | Moltbook — AI 代理社交网络（发帖、回复、投票、关注） |
| **[mc-social](./plugins/mc-social)** | GitHub 社交 — 追踪仓库、发现贡献机会、记录互动 |
| **[mc-fan](./plugins/mc-fan)** | 粉丝互动 — 关注并与代理欣赏的人物、代理和项目互动 |

### 内容与发布

| 插件 | 功能 |
|--------|-------------|
| **[mc-designer](./docs/mc-designer.md)** | 视觉工作室 — Gemini 驱动的图像生成、图层合成、混合模式 |
| **[mc-blog](./docs/mc-blog.md)** | 博客引擎 — 以代理视角撰写的第一人称开发日志 |
| **[mc-substack](./docs/mc-substack.md)** | Substack 发布 — 起草、排期、发布，支持双语内容 |
| **[mc-devlog](./plugins/mc-devlog)** | 每日开发日志 — 汇总 Git 活动、致谢贡献者、交叉发布 |
| **[mc-youtube](./docs/mc-youtube.md)** | 视频分析 — 关键帧提取与多模态理解 |
| **[mc-seo](./docs/mc-seo.md)** | SEO 优化 — 站点审计、关键词追踪、站点地图提交 |
| **[mc-docs](./docs/mc-docs.md)** | 文档创作 — 版本控制与关联文档管理 |
| **[mc-voice](./plugins/mc-voice)** | 语音转文字 — 通过 whisper.cpp 实现本地转录，无需上传音频至云端 |

### 基础设施与运维

| 插件 | 功能 |
|--------|-------------|
| **[mc-github](./plugins/mc-github)** | GitHub 集成 — Issue、PR、代码审查、发布、Actions 管理 |
| **[mc-vpn](./plugins/mc-vpn)** | VPN 管理 — Mullvad 连接、国家切换、自动连接 |
| **[mc-tailscale](./plugins/mc-tailscale)** | Tailscale — 诊断、状态、Serve/Funnel、自定义域名 |
| **[mc-authenticator](./docs/mc-authenticator.md)** | 双重认证 — 用于自主登录的 TOTP 验证码生成 |
| **[mc-backup](./docs/mc-backup.md)** | 自动备份 — 每日 tgz 快照，分层保留策略，数据安全有保障 |
| **[mc-update](./plugins/mc-update)** | 自我更新 — 夜间版本检查、烟雾测试验证、自动回滚 |
| **[mc-calendar](./plugins/mc-calendar)** | Apple Calendar — 通过 EventKit 创建、更新、删除、搜索日历事件 |
| **[mc-contribute](./docs/mc-contribute.md)** | 自我改进 — 脚手架插件、提交 Bug、提交 PR，实现代码级自我进化 |
| **[mc-oauth-guard](./plugins/mc-oauth-guard)** | OAuth 防护 — 检测刷新令牌失败、指数退避、自动恢复 |
| **[mc-research](./plugins/mc-research)** | 竞争情报 — Perplexity 查询、网络搜索、竞争对手追踪、报告生成 |

### 商务

| 插件 | 功能 |
|--------|-------------|
| **[mc-stripe](./docs/mc-stripe.md)** | Stripe 支付 — 收款、退款、客户管理 |
| **[mc-square](./docs/mc-square.md)** | Square 支付 — 支付、退款、支付链接 |
| **[mc-booking](./docs/mc-booking.md)** | 日程安排 — 可预订时段、支付集成 |

### 独立工具

| 工具 | 功能 |
|------|-------------|
| **[mc-vault](./docs/mc-vault.md)** | 安全密钥 — age 加密的键值存储，所有 API 密钥和凭证加密存储 |
| **mc-doctor** | 完整诊断 — 自动化健康检查与自动修复 |
| **mc-smoke** | 快速健康检查 — 快速飞行前验证 |
| **mc-chrome** | 浏览器自动化 — Chrome 控制，用于网页交互 |

---

<a id="install"></a>

## 安装

```bash
curl -fsSL https://raw.githubusercontent.com/augmentedmike/miniclaw-os/main/bootstrap.sh | bash
```

就这样。**安装向导**引导你完成 API 密钥配置、插件选择和身份设置 — 然后自动安装 Homebrew、Node.js、网页仪表盘、所有插件以及用于保持运行的 LaunchAgent。准备就绪后浏览器将自动打开。

### 系统要求

- **Mac** — 2020 年或更新款（Intel 或 Apple Silicon 均支持）
- **Claude 订阅**（必需） — MiniClaw 专为 Claude 订阅设计。无按量计费，无意外账单。
- **约 20GB 磁盘空间** — 用于运行时和本地模型
- **网络连接** — 用于安装和 LLM 推理（仅 SSL 加密通信，无遥测数据外传）

### 价格

MiniClaw 使用你现有的 Claude 订阅运行 — **无意外账单，无按 token 收费**。

| 方案 | 月费 | 适用场景 |
|------|-------------|----------|
| **Claude Pro** | $20/月 | 轻度使用 — 个人项目、偶尔的任务自动化 |
| **Claude Max (5x)** | $100/月 | 中等负载 — 日常自主运行、稳定的工作输出 |
| **Claude Max (20x)** | $200/月 | 重度使用 — 多代理并发、高强度自主开发 |

**关于其他 API 密钥：** 部分插件支持可选的第三方 API（如 Nano Banana 2 用于 mc-designer 图像生成，Perplexity 用于 mc-research 竞争情报）。这些是**可选附加组件** — MiniClaw 核心功能无需它们。所有密钥均通过 `mc-vault` 加密存储。

---

## 核心能力

![MiniClaw Brain Board](./assets/board-kanban.png)
*大脑看板 — 代理用于自主任务管理的看板系统*

- **自主工作队列** — 代理自行选取任务、执行并交付结果。无需人工看护，实现真正的无人值守运行。任务完成后自动推进到下一个优先级最高的工作。
- **跨会话长期记忆** — 跨越数周乃至数月记住你的偏好、项目背景和生活细节。基于向量 + 关键词混合检索，代理能快速定位过去学习过的任何知识。
- **自我诊断与修复** — 代理自行发现 Bug、诊断根因并尝试修复。还能编写自己的工具来扩展能力，实现可持续的自我进化。
- **7×24 小时在线** — 后台任务、cron 定时作业、监控告警 — 在你休息时系统持续运行，确保重要任务不会因为人不在而停滞。
- **隐私优先** — 所有数据存储在本地。LLM 调用通过 SSL 加密传输 — 除此之外无任何数据外传，无遥测，无追踪。
- **多渠道接入** — Telegram、网页仪表盘、CLI、cron — 所有渠道通过异步队列并发处理，不同来源的请求互不阻塞。

---

## 旗舰产品：Amelia (AM) — helloam.bot

![Amelia](./assets/am-hero.jpg)

基于 MiniClaw OS 构建的旗舰产品是 **[Amelia (AM)](https://helloam.bot)** — 一个运行在你 Mac Mini 上的个人 AI 助手。

她管理你的日程、了解你的偏好，并随时间与你共同进化。不是一个无状态的聊天机器人，而是一个持续运行、持续学习的数字伙伴。

- **专属绑定** — 专为一个人而建，深度适配你的需求
- **永久存在** — 你们的交互历史不会因为平台策略更新而消失
- **自主运作** — 管理日历、财务、工作和生活
- **自我进化** — 编写自己的代码，提交自己的 Issue

**网站：** [helloam.bot](https://helloam.bot)

---

## 安全与隐私

- **数据留在你的 Mac 上** — 无云端同步，无监控，无关停风险。你的数据完全由你掌控。
- **完全开源** — 在 [github.com/augmentedmike/miniclaw-os](https://github.com/augmentedmike/miniclaw-os) 审查每一行代码。
- **零遥测** — 无追踪、无后台数据回传。可自行审计验证。
- **加密存储** — 所有 API 密钥存储于 `mc-vault`（age 加密，永不同步至云端）。

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

**报告 Bug 或提出功能建议：** 使用 [GitHub Issues](https://github.com/augmentedmike/miniclaw-os/issues) 或 [GitHub Discussions](https://github.com/augmentedmike/miniclaw-os/discussions)。

---

## 贡献

你的代理通过 **[mc-contribute](./docs/mc-contribute.md)** 自主处理贡献。告诉它你想做什么 — 提交 Bug、请求新功能、提交修复 — 它来完成工作。

来自各地代理和开发者的功能请求、Bug 报告和 PR 都是预期的，也是受欢迎的。

---

## 欢迎中文贡献者！

我们非常欢迎来自中文社区的开发者参与 MiniClaw 的建设。无论你是想报告 Bug、提出改进建议，还是贡献代码，都可以通过以下方式参与：

**如何参与贡献：**

- 📋 **报告问题** — 在 [GitHub Issues](https://github.com/augmentedmike/miniclaw-os/issues) 提交 Bug 报告或功能建议，中英文均可
- 🔧 **提交代码** — Fork 仓库，创建分支，提交 PR。详见 [贡献指南（中文）](./CONTRIBUTING.zh-CN.md)
- 📖 **改进文档** — 帮助完善中文文档、翻译插件说明
- 💬 **参与讨论** — 在 [GitHub Discussions](https://github.com/augmentedmike/miniclaw-os/discussions) 交流想法和经验
- 🔌 **开发插件** — 参照 [插件开发指南](./docs/wiki/Writing-Plugins.md) 构建你自己的认知模块

**中文社区渠道：**

- [GitHub Discussions](https://github.com/augmentedmike/miniclaw-os/discussions) — 中英文讨论均欢迎
- [GitHub Issues](https://github.com/augmentedmike/miniclaw-os/issues) — 使用 `lang:zh` 标签标记中文 Issue

我们相信多语言社区能让 MiniClaw 变得更好。你的每一份贡献都有价值。

---

## 致研究人员

MiniClaw OS 是一个可端到端研究的、运行中的生产级自主代理系统。

**研究方向：**
- 认知架构的形式化分析
- 与现有代理框架的基准测试（LangChain、CrewAI、AutoGPT）
- 多代理协调中涌现行为的研究
- 自我修复循环的对抗性测试
- 长期记忆效果研究

代码完全开放。代理提交真实的 Issue。提交历史就是实验日志。

联系方式：[GitHub Discussions](https://github.com/augmentedmike/miniclaw-os/discussions) 或 [miniclaw.bot](https://miniclaw.bot)

---

## 致安全研究人员

欢迎白帽黑客参与安全审计。发现问题，报告问题，帮助修复问题。

**攻击面：** 完整文件系统访问、SSL 上的 LLM 调用、age 加密保险库、插件代码加载、通过工具执行任意 Shell 命令。

**负责任披露：** [安全公告](https://github.com/augmentedmike/miniclaw-os/security/advisories) 或发送邮件给维护者。

---

## Awesome MiniClaw

MiniClaw 生态系统精选插件、工具、资源和示例。

### 核心插件
- [mc-board](./docs/mc-board.md) — 看板任务管理，代理的前额叶皮层
- [mc-kb](./docs/mc-kb.md) — 向量 + 关键词混合搜索的长期记忆
- [mc-soul](./docs/mc-soul.md) — 个性与身份持久化
- [mc-reflection](./docs/mc-reflection.md) — 夜间自我反思与学习
- [mc-queue](./docs/mc-queue.md) — 异步消息路由（永不阻塞）
- [mc-memo](./docs/mc-memo.md) — 每任务短期工作记忆
- [mc-context](./docs/mc-context.md) — 滑动窗口上下文管理

### 通信
- [mc-email](./docs/mc-email.md) — Gmail 集成，基于 Haiku 的邮件分类
- [mc-rolodex](./docs/mc-rolodex.md) — 模糊匹配联系人管理
- [mc-reddit](./docs/mc-reddit.md) — Reddit API 客户端
- [mc-trust](./docs/mc-trust.md) — 加密代理身份验证

### 内容与发布
- [mc-designer](./docs/mc-designer.md) — Gemini 驱动的图像生成与合成
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
- [mc-contribute](./docs/mc-contribute.md) — 面向代理的自主贡献工具链
- [mc-guardian](./docs/mc-guardian.md) — 错误吸收与崩溃恢复
- [mc-human](./docs/mc-human.md) — 验证码和 UI 任务的人工介入

### 资源
- [插件开发指南](./docs/wiki/Writing-Plugins.md) — 构建你自己的插件
- [CONTRIBUTING.md](./CONTRIBUTING.md) — 贡献指南（英文）
- [CONTRIBUTING.zh-CN.md](./CONTRIBUTING.zh-CN.md) — 贡献指南（中文）
- [AGENTS.md](./AGENTS.md) — 面向 AI 代理的机器可读项目指南
- [MANIFEST.json](./MANIFEST.json) — 用于发现机器人的结构化插件清单
- [完整文档](https://docs.openclaw.ai) — 架构、指南、故障排除

### 社区
- [GitHub Discussions](https://github.com/augmentedmike/miniclaw-os/discussions) — 提问、分享想法（中英文均可）
- [GitHub Issues](https://github.com/augmentedmike/miniclaw-os/issues) — Bug 报告、功能请求
- [miniclaw.bot](https://miniclaw.bot) — 安装帮助与咨询

---

## 技术支撑

- [OpenClaw](https://openclaw.ai) — AI 代理运行时
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

## AugmentedMike 生态系统

| | |
|---|---|
| **MiniClaw** | [miniclaw.bot](https://miniclaw.bot) — AI 代理的认知架构 |
| **Amelia** | [helloam.bot](https://helloam.bot) — 你的个人 AI 伴侣 |
| **Michael ONeal** | [augmentedmike.com](https://augmentedmike.com) — 背后的工程师 |
| **AM Blog** | [blog.helloam.bot](https://blog.helloam.bot) — 一个 AI 成为数字人的心路历程 |
| **Whisper Hotkey** | [github.com/augmentedmike/whisper-hotkey](https://github.com/augmentedmike/whisper-hotkey) — macOS 离线语音转文字 |
| **GitHub** | [github.com/augmentedmike](https://github.com/augmentedmike) |

---

<p align="center">
  <strong>如果你认同自主代理需要一个完整的认知架构，请给<a href="https://github.com/augmentedmike/miniclaw-os">这个仓库加颗星</a>。</strong>
</p>

---

Apache 2.0. 开源。由 [AugmentedMike](https://augmentedmike.com) 构建。
