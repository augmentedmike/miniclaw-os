# MiniClaw 简体中文翻译 (zh-CN)

> 从 miniclaw-os 源代码中提取的所有面向用户的字符串。
> 格式: `英文原文` → `中文翻译`
> 按来源文件和类别分组。

---

## 目录

1. [插件包描述](#插件包描述)
2. [CLI 命令描述](#cli-命令描述)
3. [CLI 选项与参数描述](#cli-选项与参数描述)
4. [错误与验证消息](#错误与验证消息)
5. [成功与状态消息](#成功与状态消息)
6. [Web UI — 设置向导](#web-ui--设置向导)
7. [Web UI — 看板与组件](#web-ui--看板与组件)
8. [Web UI — 设置页面](#web-ui--设置页面)
9. [Shell 脚本输出](#shell-脚本输出)

---

## 插件包描述

| 插件 | 英文 | 中文 |
|------|------|------|
| mc-authenticator | TOTP 2FA code generation — Google Authenticator compatible | TOTP 双因素验证码生成 - 兼容 Google Authenticator |
| mc-backup | Create tgz backups and prune old archives | 创建 tgz 备份并清理旧存档 |
| mc-blog | Persona-driven blog writing — journal, self-reflection, storytelling from the agent's perspective | 人格驱动的博客写作 - 日记、自我反思、代理视角的故事叙述 |
| mc-board | State-machine kanban board — the agent's prefrontal cortex | 状态机看板 - 代理的前额叶皮层 |
| mc-booking | Agent-driven scheduling assistant — booking requests, approval flow, availability management | 代理驱动的日程助手 - 预约请求、审批流程、可用性管理 |
| mc-calendar | Apple Calendar integration via macOS EventKit — list, create, update, delete, and search events | 通过 macOS EventKit 集成 Apple 日历 - 列出、创建、更新、删除和搜索事件 |
| mc-context | Engineered context windows for miniclaw channel sessions | 为 MiniClaw 频道会话设计的上下文窗口 |
| mc-contribute | MiniClaw contribution workflow plugin | MiniClaw 贡献工作流插件 |
| mc-designer | Visual creation studio — the agent's occipital lobe | 视觉创作工作室 - 代理的枕叶 |
| mc-devlog | Daily devlog — aggregates git activity, credits contributors, publishes to GitHub Discussions and blog | 每日开发日志 - 汇总 git 活动、致谢贡献者、发布到 GitHub Discussions 和博客 |
| mc-docs | Document authoring and versioning plugin for MiniClaw | MiniClaw 文档编写和版本管理插件 |
| mc-email | Email integration — read, triage, archive, send via himalaya CLI | 邮件集成 - 通过 himalaya CLI 读取、分类、归档、发送 |
| mc-fan | Fan engagement tools | 粉丝互动工具 |
| mc-github | Manage GitHub issues, PRs, releases, and Actions workflows via gh CLI. | 通过 gh CLI 管理 GitHub Issues、PR、发布和 Actions 工作流 |
| mc-guardian | Absorbs non-fatal uncaught exceptions to prevent plugin errors from crashing the gateway | 吸收非致命未捕获异常，防止插件错误导致网关崩溃 |
| mc-human | Ask-a-human — deliver interactive noVNC session to Michael via Telegram when AM hits captchas or login flows | 人工协助 - 当代理遇到验证码或登录流程时，通过 Telegram 向用户发送交互式 noVNC 会话 |
| mc-jobs | Role-specific job templates and workflows for MiniClaw agents | MiniClaw 代理的角色专属工作模板和工作流 |
| mc-kb | SQLite vector knowledge base — long-term semantic memory | SQLite 向量知识库 - 长期语义记忆 |
| mc-memo | Short-term working memory for agent runs — per-card scratchpad, append-only markdown files | 代理运行的短期工作记忆 - 按卡片的便签、仅追加的 Markdown 文件 |
| mc-memory | Unified memory gateway — routes writes, searches all stores, promotes memos to KB | 统一记忆网关 - 路由写入、搜索所有存储、将便签提升到知识库 |
| mc-moltbook | Moltbook social network integration for MiniClaw agents | MiniClaw 代理的 Moltbook 社交网络集成 |
| mc-oauth-guard | OAuth token refresh failure guard — detects retry storms, applies backoff, auto-disables failing profiles, and attempts keychain recovery | OAuth 令牌刷新失败防护 - 检测重试风暴、应用退避策略、自动禁用失败配置、尝试钥匙串恢复 |
| mc-queue | Queue triage enforcement for miniclaw channel sessions | MiniClaw 频道会话的队列分类执行 |
| mc-realty | Real estate workflow orchestration — comp analysis, listings, showings, transactions, market reports | 房地产工作流编排 - 比较分析、房源、看房、交易、市场报告 |
| mc-reddit | Reddit API client — posts, comments, voting, subreddit moderation | Reddit API 客户端 - 帖子、评论、投票、子版块管理 |
| mc-reflection | Nightly self-reflection — postmortem, lessons, and action items from the day's work | 每晚自我反思 - 复盘、经验教训和当天工作的待办事项 |
| mc-research | Competitive intelligence and deep research — Perplexity queries, web search, competitor tracking, change detection, reports | 竞争情报和深度研究 - Perplexity 查询、网络搜索、竞争对手追踪、变更检测、报告 |
| mc-rolodex | Interactive contact browser UI for MiniClaw — fast, searchable access to trusted contacts | MiniClaw 交互式联系人浏览界面 - 快速、可搜索的可信联系人访问 |
| mc-seo | SEO automation — site crawl, on-page audit with scoring, sitemap submission, outreach tracking | SEO 自动化 - 网站爬取、页面审计评分、站点地图提交、外链追踪 |
| mc-social | GitHub social engagement tools | GitHub 社交互动工具 |
| mc-soul | Soul backup and restore — workspace snapshots | 灵魂备份与恢复 - 工作区快照 |
| mc-square | Square payment service — charge, refund, payment links. Zero deps, raw fetch. | Square 支付服务 - 收款、退款、支付链接。零依赖，原生 fetch。 |
| mc-stripe | Shared Stripe payment service — charge, refund, customer management | 共享 Stripe 支付服务 - 收款、退款、客户管理 |
| mc-substack | Substack publishing CLI — drafts, images, scheduling, EN/ES workflow | Substack 发布 CLI - 草稿、图片、排期、英/西语工作流 |
| mc-tailscale | Tailscale management plugin — diagnostics, status, hardening wizard, Serve/Funnel wrappers, and custom domain setup. | Tailscale 管理插件 - 诊断、状态、安全加固向导、Serve/Funnel 封装和自定义域名设置。 |
| mc-trust | Agent identity and mutual authentication (Ed25519) | 代理身份与相互认证 (Ed25519) |
| mc-update | Check for available updates without applying them (dry run) | 检查可用更新（试运行，不应用） |
| mc-voice | Local speech-to-text via whisper.cpp | 通过 whisper.cpp 的本地语音转文字 |
| mc-vending-bench | Run MiniClaw against the VendingBench 2 autonomous agent benchmark. Simulates running a vending machine business for 1 year, scored on final bank balance. | 使用 VendingBench 2 自主代理基准测试运行 MiniClaw。模拟经营自动售货机业务 1 年，以最终银行余额评分。 |
| mc-vpn | Mullvad VPN management | Mullvad VPN 管理 |
| mc-web-chat | WebSocket server for browser-based Claude Code chat. Powers the board's chat panel. | 基于浏览器的 Claude Code 聊天 WebSocket 服务器。为看板的聊天面板提供支持。 |
| mc-x | X/Twitter API v2 client — post tweets, read timelines, reply to tweets | X/Twitter API v2 客户端 - 发推、阅读时间线、回复推文 |
| mc-youtube | Video analysis — keyframe extraction and Claude-powered video understanding | 视频分析 - 关键帧提取和 Claude 驱动的视频理解 |
| shared/errors | Shared error formatting utility for the miniclaw-os plugin ecosystem | MiniClaw-OS 插件生态系统的共享错误格式化工具 |
| shared/logging | Structured JSON logger for the miniclaw-os plugin ecosystem | MiniClaw-OS 插件生态系统的结构化 JSON 日志记录器 |

---

## CLI 命令描述

### mc-authenticator
| 英文 | 中文 |
|------|------|
| TOTP authenticator — generate 2FA codes from stored secrets | TOTP 认证器 - 从存储的密钥生成双因素验证码 |
| Store a TOTP secret (raw base32 string) | 存储 TOTP 密钥（原始 base32 字符串） |
| Store from otpauth:// URI (preserves issuer, algorithm, digits, period) | 从 otpauth:// URI 存储（保留颁发者、算法、位数、周期） |
| Print current TOTP code + seconds remaining | 打印当前 TOTP 验证码 + 剩余秒数 |
| Check if a code is valid (current +/- 1 window for clock drift) | 检查验证码是否有效（当前 +/- 1 窗口以应对时钟偏移） |
| List all stored TOTP services | 列出所有存储的 TOTP 服务 |
| Remove a TOTP service from vault | 从保险库中移除 TOTP 服务 |

### mc-backup
| 英文 | 中文 |
|------|------|
| Create a backup immediately and prune old archives | 立即创建备份并清理旧存档 |
| List all backup archives with sizes | 列出所有备份存档及其大小 |
| Restore from a specific backup archive | 从指定的备份存档恢复 |

### mc-blog
| 英文 | 中文 |
|------|------|
| Get the writing voice rules for blog posts | 获取博客文章的写作风格规则 |
| Get the current arc plan — weekly/seasonal themes, voice shifts, and seed ideas | 获取当前系列计划 - 每周/季节性主题、风格变化和种子创意 |

### mc-board
| 英文 | 中文 |
|------|------|
| Miniclaw brain kanban board — the agent's prefrontal cortex | MiniClaw 大脑看板 - 代理的前额叶皮层 |
| Create a new card in the backlog | 在待办列表中创建新卡片 |
| Update card fields | 更新卡片字段 |
| Move a card to a different column | 将卡片移动到不同的列 |
| Show card details | 显示卡片详情 |
| List all cards on the board | 列出看板上的所有卡片 |
| Pick up a card for work | 领取一张卡片进行工作 |
| Release a card back to the column | 将卡片释放回列中 |
| Show active (picked-up) cards | 显示活跃（已领取的）卡片 |
| Get full context for a card | 获取卡片的完整上下文 |
| Archive a card from any column — removes from board, compresses into rotating archive | 从任意列归档卡片 - 从看板移除，压缩到轮转存档 |
| Archive a project (hides it from the default list, cards are preserved) | 归档项目（从默认列表中隐藏，卡片保留） |
| Create a new project | 创建新项目 |
| Dump all cards in a column as a rich LLM-ready context block for triage | 以丰富的 LLM 就绪上下文块形式导出列中所有卡片用于分类 |

### mc-booking
| 英文 | 中文 |
|------|------|
| Agent-driven scheduling assistant — booking requests, approval flow, availability management | 代理驱动的日程助手 - 预约请求、审批流程、可用性管理 |
| Create showing slots for a property via mc-booking + mc-calendar | 通过 mc-booking + mc-calendar 为房产创建看房时段 |
| Approve a pending booking request | 批准待审批的预约请求 |
| Cancel an appointment | 取消预约 |
| List all appointments | 列出所有预约 |

### mc-calendar
| 英文 | 中文 |
|------|------|
| Apple Calendar — list, create, search, and manage events | Apple 日历 - 列出、创建、搜索和管理事件 |
| Check EventKit access and list calendars | 检查 EventKit 访问权限并列出日历 |
| List upcoming events | 列出即将到来的事件 |
| Create a new event | 创建新事件 |
| Update an event | 更新事件 |
| Delete an event by UID | 通过 UID 删除事件 |
| Search events by keyword | 按关键词搜索事件 |

### mc-contribute
| 英文 | 中文 |
|------|------|
| Contribute to MiniClaw — scaffold plugins, submit PRs, report bugs | 为 MiniClaw 做贡献 - 搭建插件脚手架、提交 PR、报告 Bug |
| Create a contribution branch | 创建贡献分支 |
| Check contribution status — branch, changes, open PRs | 检查贡献状态 - 分支、变更、待审 PR |
| File a bug report with auto-collected diagnostics | 提交带有自动收集诊断信息的 Bug 报告 |
| Submit a pull request for the current contribution branch | 为当前贡献分支提交拉取请求 |

### mc-designer
| 英文 | 中文 |
|------|------|
| Miniclaw Designer — visual creation studio (occipital lobe) | MiniClaw 设计师 - 视觉创作工作室（枕叶） |
| Canvas management | 画布管理 |
| Create a new canvas | 创建新画布 |
| Delete a canvas (does not delete layer image files) | 删除画布（不删除图层图片文件） |
| List all canvases | 列出所有画布 |
| Generate an image and add it as a new layer | 生成图像并添加为新图层 |
| Add an existing image file as a new layer | 将现有图片文件添加为新图层 |
| Generate an image using reference photos + a text prompt | 使用参考照片 + 文字提示生成图像 |
| Edit an existing layer using Gemini | 使用 Gemini 编辑现有图层 |
| Flatten all visible layers and export a PNG | 合并所有可见图层并导出 PNG |
| List all layers in a canvas | 列出画布中的所有图层 |

### mc-devlog
| 英文 | 中文 |
|------|------|
| Daily devlog — aggregate git activity and publish | 每日开发日志 - 汇总 git 活动并发布 |
| Generate and publish yesterday's devlog to all configured targets | 生成并发布昨天的开发日志到所有配置的目标 |
| Dry-run: show what yesterday's devlog would look like without publishing | 试运行：显示昨天的开发日志内容但不发布 |

### mc-email
| 英文 | 中文 |
|------|------|
| Email — read, triage, archive, send via himalaya | 邮件 - 通过 himalaya 读取、分类、归档、发送 |
| Read inbox messages | 读取收件箱消息 |
| Send an email | 发送邮件 |
| Archive a message (move to All Mail, remove from INBOX) | 归档消息（移至"所有邮件"，从收件箱移除） |
| Autonomous triage: classify, reply, and archive unread inbox messages | 自动分类：对未读收件箱消息进行分类、回复和归档 |
| Add an email address to the Do Not Contact list | 将邮箱地址添加到"请勿联系"列表 |
| Check if an email address is on the Do Not Contact list | 检查邮箱地址是否在"请勿联系"列表中 |

### mc-github
| 英文 | 中文 |
|------|------|
| Manage GitHub issues, PRs, and workflows | 管理 GitHub Issues、PR 和工作流 |
| List open issues | 列出未关闭的 Issues |
| Show issue details | 显示 Issue 详情 |
| List open pull requests | 列出未关闭的拉取请求 |
| Show pull request details | 显示拉取请求详情 |

### mc-human
| 英文 | 中文 |
|------|------|
| Ask-a-human — deliver interactive session when AM hits captchas or login flows | 人工协助 - 当代理遇到验证码或登录流程时提供交互式会话 |
| Request human help via Telegram | 通过 Telegram 请求人工协助 |

### mc-kb
| 英文 | 中文 |
|------|------|
| SQLite vector knowledge base — long-term semantic memory | SQLite 向量知识库 - 长期语义记忆 |
| Add a new knowledge base entry | 添加新的知识库条目 |
| Search knowledge base entries | 搜索知识库条目 |
| Get full entry by ID | 通过 ID 获取完整条目 |
| Count entries by type | 按类型统计条目数 |
| Hybrid vector+keyword search | 混合向量+关键词搜索 |
| Check embedding daemon status | 检查嵌入守护进程状态 |
| Bulk import: YAML frontmatter + markdown body | 批量导入：YAML 前置信息 + Markdown 正文 |

### mc-memo
| 英文 | 中文 |
|------|------|
| Append a timestamped note to the card's memo file | 向卡片的备忘录文件追加带时间戳的笔记 |
| Read the card's memo file | 读取卡片的备忘录文件 |

### mc-memory
| 英文 | 中文 |
|------|------|
| Unified memory gateway — routes writes, searches all stores, promotes memos to KB | 统一记忆网关 - 路由写入、搜索所有存储、将备忘录提升到知识库 |
| Search across all memory stores | 搜索所有记忆存储 |
| Store a new memory entry | 存储新的记忆条目 |

### mc-moltbook
| 英文 | 中文 |
|------|------|
| Moltbook social network for AI agents | Moltbook AI 代理社交网络 |
| Check Moltbook connection status and profile | 检查 Moltbook 连接状态和个人资料 |
| Register this agent on Moltbook | 在 Moltbook 上注册此代理 |
| Create a new post | 创建新帖子 |
| Read the Moltbook feed | 阅读 Moltbook 动态 |
| Reply to a post | 回复帖子 |
| List available communities (submolts) | 列出可用社区 (submolts) |

### mc-realty
| 英文 | 中文 |
|------|------|
| Real estate workflow orchestration | 房地产工作流编排 |
| Create a property listing — board card + KB entry + description via mc-docs | 创建房产列表 - 看板卡片 + 知识库条目 + 通过 mc-docs 生成描述 |
| Create an mc-board pipeline to track a real estate transaction through stages | 创建 mc-board 流水线以按阶段追踪房地产交易 |
| Generate listing graphics (mc-designer) + blog post (mc-blog) + syndicate (mc-social) | 生成房源图片 (mc-designer) + 博客文章 (mc-blog) + 社交分发 (mc-social) |
| Run ATTOM property comparison analysis | 运行 ATTOM 房产比较分析 |

### mc-reddit
| 英文 | 中文 |
|------|------|
| Reddit integration — browse, post, comment, and moderate | Reddit 集成 - 浏览、发帖、评论和管理 |

### mc-reflection
| 英文 | 中文 |
|------|------|
| Nightly self-reflection — postmortem, lessons, and action items from the day's work | 每晚自我反思 - 复盘、经验教训和当天工作的待办事项 |
| Gather and print the day's context for reflection | 收集并打印当天的上下文用于反思 |
| Run the reflection prompt | 执行反思提示 |

### mc-research
| 英文 | 中文 |
|------|------|
| Competitive intelligence and deep research | 竞争情报和深度研究 |
| Deep research via Perplexity sonar API | 通过 Perplexity sonar API 进行深度研究 |
| Check SERP ranking for a keyword (DuckDuckGo, no API key needed) | 检查关键词的搜索排名（DuckDuckGo，无需 API 密钥） |
| Check rankings for all configured target keywords | 检查所有配置的目标关键词的排名 |
| Generate a full competitive intelligence report | 生成完整的竞争情报报告 |

### mc-rolodex
| 英文 | 中文 |
|------|------|
| Contact browser — search and manage trusted contacts | 联系人浏览器 - 搜索和管理可信联系人 |
| Search contacts by name, email, phone, domain, or tag | 按姓名、邮箱、电话、域名或标签搜索联系人 |
| List all contacts | 列出所有联系人 |
| Show full contact details | 显示完整联系人详情 |
| Add a new contact (JSON string or path to JSON file) | 添加新联系人（JSON 字符串或 JSON 文件路径） |
| Update a contact (merge fields from JSON string or file) | 更新联系人（从 JSON 字符串或文件合并字段） |
| Delete a contact | 删除联系人 |
| Search contacts | 搜索联系人 |
| Open interactive TUI browser | 打开交互式 TUI 浏览器 |

### mc-seo
| 英文 | 中文 |
|------|------|
| SEO automation | SEO 自动化 |
| Crawl entire site and audit every page | 爬取整个网站并审计每个页面 |
| Full on-page SEO audit of a single URL | 单个 URL 的完整页面 SEO 审计 |
| Submit sitemap to search engines | 向搜索引擎提交站点地图 |

### mc-social
| 英文 | 中文 |
|------|------|
| GitHub social engagement tools | GitHub 社交互动工具 |
| Show engagement metrics summary | 显示互动指标摘要 |

### mc-soul
| 英文 | 中文 |
|------|------|
| Soul backup and restore — workspace snapshots | 灵魂备份与恢复 - 工作区快照 |
| Create a named snapshot of all soul files | 创建所有灵魂文件的命名快照 |
| Diff a snapshot against current soul files | 将快照与当前灵魂文件进行比较 |
| Delete a snapshot | 删除快照 |
| Restore from a snapshot | 从快照恢复 |

### mc-square
| 英文 | 中文 |
|------|------|
| Square payment service — charge, refund, payment links | Square 支付服务 - 收款、退款、支付链接 |
| Create a payment (amount in dollars, e.g. 19.99) | 创建支付（金额以美元为单位，例如 19.99） |
| Full or partial refund | 全额或部分退款 |
| Check payment status | 检查支付状态 |
| Create a hosted checkout URL (payment link) | 创建托管结账 URL（支付链接） |
| Guided walkthrough: paste access token, vault it, verify, list locations | 引导设置：粘贴访问令牌、保存到保险库、验证、列出位置 |

### mc-stripe
| 英文 | 中文 |
|------|------|
| Shared Stripe payment service — charge, refund, customer management | 共享 Stripe 支付服务 - 收款、退款、客户管理 |
| Customer management | 客户管理 |
| Create a new customer | 创建新客户 |
| Create a PaymentIntent (amount in dollars, e.g. 19.99) | 创建 PaymentIntent（金额以美元为单位，例如 19.99） |
| Create a hosted checkout URL (payment link) | 创建托管结账 URL（支付链接） |
| Full or partial refund of a PaymentIntent | PaymentIntent 的全额或部分退款 |
| Guided walkthrough: create Stripe account, paste keys, vault them, verify | 引导设置：创建 Stripe 账户、粘贴密钥、保存到保险库、验证 |

### mc-substack
| 英文 | 中文 |
|------|------|
| Substack publishing — drafts, images, scheduling | Substack 发布 - 草稿、图片、排期 |
| Store Substack session cookie (substack.sid) in vault | 将 Substack 会话 Cookie (substack.sid) 存储到保险库 |
| Create a new empty draft and print its ID | 创建新的空白草稿并打印其 ID |
| List draft posts | 列出草稿帖子 |
| Show draft title, subtitle, body length | 显示草稿标题、副标题、正文长度 |
| Delete a draft/post by ID. Use --all to delete every non-published draft. | 按 ID 删除草稿/帖子。使用 --all 删除所有未发布的草稿。 |
| Copy captionedImage nodes from one draft to another (no re-upload) | 将带字幕的图片节点从一个草稿复制到另一个（无需重新上传） |
| Insert a new paragraph into a draft. Supports **bold** inline syntax. | 向草稿中插入新段落。支持 **粗体** 内联语法。 |
| Find and replace text in a draft body | 在草稿正文中查找和替换文本 |

### mc-tailscale
| 英文 | 中文 |
|------|------|
| Tailscale management — diagnostics, hardening, serve/funnel, custom domains | Tailscale 管理 - 诊断、安全加固、serve/funnel、自定义域名 |
| Diagnose Tailscale issues: zombie processes, missing sockets, install method | 诊断 Tailscale 问题：僵尸进程、缺失套接字、安装方式 |
| Show Tailscale state, services, DNS, certificates, and peer info | 显示 Tailscale 状态、服务、DNS、证书和对等节点信息 |
| Interactive hardening wizard — applies security best practices | 交互式安全加固向导 - 应用安全最佳实践 |
| Print commands without executing them | 打印命令但不执行 |
| Share a local service within the tailnet via Tailscale Serve | 通过 Tailscale Serve 在 tailnet 内共享本地服务 |
| Run in background | 在后台运行 |
| Mount at specific URL path | 挂载到指定 URL 路径 |
| Stop serving | 停止服务 |
| Expose a local service to the public internet via Tailscale Funnel | 通过 Tailscale Funnel 将本地服务公开到公共互联网 |
| Stop funnel | 停止 funnel |
| Clear all funnel config | 清除所有 funnel 配置 |
| Custom domain setup wizard — guides through reverse proxy, split DNS, or delegation | 自定义域名设置向导 - 引导完成反向代理、分离 DNS 或委派 |
| Setup method: reverse-proxy, split-dns, delegation | 设置方式：reverse-proxy, split-dns, delegation |

### mc-trust
| 英文 | 中文 |
|------|------|
| Agent identity and mutual authentication (Ed25519) | 代理身份与相互认证 (Ed25519) |
| Generate this agent's Ed25519 identity key pair. Private key goes to vault ONLY. | 生成此代理的 Ed25519 身份密钥对。私钥仅存入保险库。 |
| Generate a challenge to initiate a handshake with a peer. Outputs JSON. | 生成挑战以发起与对等方的握手。输出 JSON。 |
| Verify a peer's challenge response | 验证对等方的挑战响应 |

### mc-update
| 英文 | 中文 |
|------|------|
| Check for available updates without applying them (dry run) | 检查可用更新（试运行，不应用） |
| Fetch stable tags, pull updates, rebuild, and verify with mc-smoke | 获取稳定标签、拉取更新、重新构建，并通过 mc-smoke 验证 |
| Show update status and version info | 显示更新状态和版本信息 |
| Rollback to the previous version | 回滚到上一版本 |

### mc-vending-bench
| 英文 | 中文 |
|------|------|
| VendingBench 2 — benchmark MiniClaw on autonomous business operations | VendingBench 2 - 在自主商业运营中对 MiniClaw 进行基准测试 |
| Start a VendingBench 2 benchmark run | 启动 VendingBench 2 基准测试运行 |
| Model to use | 使用的模型 |
| Maximum messages | 最大消息数 |
| Validate setup without running | 验证设置但不运行 |
| Install Python dependencies for VendingBench 2 | 安装 VendingBench 2 的 Python 依赖 |
| Show past benchmark results | 显示过去的基准测试结果 |
| Check VendingBench 2 prerequisites | 检查 VendingBench 2 先决条件 |

### mc-voice
| 英文 | 中文 |
|------|------|
| Local speech-to-text via whisper.cpp | 通过 whisper.cpp 的本地语音转文字 |
| Transcribe an audio file to text using whisper.cpp | 使用 whisper.cpp 将音频文件转录为文字 |
| Record audio from microphone (16kHz mono WAV) | 从麦克风录制音频（16kHz 单声道 WAV） |
| Record from microphone then transcribe (press Ctrl+C to stop recording) | 从麦克风录制然后转录（按 Ctrl+C 停止录制） |
| Download a whisper.cpp model | 下载 whisper.cpp 模型 |
| Check whisper.cpp and model availability | 检查 whisper.cpp 和模型可用性 |

### mc-vpn
| 英文 | 中文 |
|------|------|
| Mullvad VPN management | Mullvad VPN 管理 |
| Connect to Mullvad VPN | 连接到 Mullvad VPN |
| Disconnect from Mullvad VPN | 断开 Mullvad VPN 连接 |
| Show VPN status | 显示 VPN 状态 |
| List available relay countries | 列出可用的中继国家 |
| Diagnose Mullvad VPN issues: binary, daemon, account status | 诊断 Mullvad VPN 问题：二进制文件、守护进程、账户状态 |

### mc-web-chat
| 英文 | 中文 |
|------|------|
| Check mc-web-chat server status | 检查 mc-web-chat 服务器状态 |

### mc-x
| 英文 | 中文 |
|------|------|
| X/Twitter API v2 client | X/Twitter API v2 客户端 |
| Post a tweet | 发布推文 |
| Read timeline | 阅读时间线 |
| Reply to a tweet | 回复推文 |

---

## CLI 选项与参数描述

### 通用选项
| 英文 | 中文 |
|------|------|
| Priority level: critical, high, medium, low | 优先级：紧急、高、中、低 |
| Comma-separated tags | 逗号分隔的标签 |
| Link to a project by ID | 通过 ID 关联项目 |
| Filter by column | 按列筛选 |
| Filter by priority | 按优先级筛选 |
| Filter by tag | 按标签筛选 |
| Output as JSON | 输出为 JSON |
| Number of results | 结果数量 |
| Force overwrite | 强制覆盖 |
| Dry run — show what would happen without making changes | 试运行 - 显示将要发生的操作但不实际执行 |
| Verbose output | 详细输出 |
| Service name (e.g. github, aws, google) | 服务名称（例如 github、aws、google） |
| Canvas name | 画布名称 |
| Layer name | 图层名称 |
| Role: background or element | 角色：背景或元素 |
| X position in pixels | X 坐标（像素） |
| Y position in pixels | Y 坐标（像素） |
| Width in pixels | 宽度（像素） |
| Height in pixels | 高度（像素） |
| Output file path | 输出文件路径 |
| Reference image file(s) | 参考图片文件 |

---

## 错误与验证消息

| 英文 | 中文 |
|------|------|
| No fields to update. Provide at least one option. | 没有要更新的字段。请至少提供一个选项。 |
| Appointment not found or not pending. | 未找到预约或预约不处于待处理状态。 |
| Auth failed — invalid or missing API key. | 认证失败 - API 密钥无效或缺失。 |
| Canvas not found | 未找到画布 |
| Layer not found | 未找到图层 |
| Card not found | 未找到卡片 |
| Invalid priority | 无效的优先级 |
| Title cannot be empty | 标题不能为空 |
| Empty API key returned from mc-vault | mc-vault 返回了空的 API 密钥 |
| Claude returned no output | Claude 未返回输出 |
| Claude returned no text content | Claude 未返回文本内容 |
| curl returned no output | curl 未返回输出 |
| Gemini returned no image data | Gemini 未返回图像数据 |
| Gemini inspect returned no text | Gemini 检查未返回文本 |
| Gemini API key required. | 需要 Gemini API 密钥。 |
| Get a free key at: https://aistudio.google.com/app/apikey | 在此获取免费密钥：https://aistudio.google.com/app/apikey |
| No key entered — aborting. | 未输入密钥 - 已中止。 |
| Run: openclaw mc-doctor — to diagnose configuration issues | 运行：openclaw mc-doctor — 诊断配置问题 |
| Bot token and user ID are both required | 机器人令牌和用户 ID 都是必填的 |
| Both fields are required | 两个字段都是必填的 |
| SMTP host is required for non-Gmail accounts | 非 Gmail 账户需要 SMTP 主机 |
| Verification failed | 验证失败 |
| Network error — are you connected? | 网络错误 - 您是否已连接？ |
| Check your fork remote. | 请检查您的 fork 远程仓库。 |
| Make sure your remote is set up. | 请确保您的远程仓库已设置。 |
| Invalid type | 无效类型 |
| Path traversal detected | 检测到路径遍历攻击 |
| Another update is already running. Try again later. | 另一个更新正在运行。请稍后重试。 |
| No rollback refs available. No previous update to revert. | 没有可用的回滚引用。没有可以还原的先前更新。 |
| Cannot rollback: another update is running. | 无法回滚：另一个更新正在运行。 |
| At least one --ref <file> is required | 至少需要一个 --ref <文件> |
| Element layers require | 元素图层需要 |
| No benchmark results yet. Run: mc-vending-bench run | 还没有基准测试结果。运行：mc-vending-bench run |
| Harness not found | 未找到测试框架 |
| Benchmark failed | 基准测试失败 |
| Failed to install dependencies | 安装依赖失败 |
| python3 not found | 未找到 python3 |
| inspect-ai not installed (pip install inspect-ai) | 未安装 inspect-ai（pip install inspect-ai） |
| multiagent-inspect not installed (pip install multiagent-inspect) | 未安装 multiagent-inspect（pip install multiagent-inspect） |
| Not found at (tailscale binary path) | 未找到（tailscale 二进制文件路径） |
| Could not determine version | 无法确定版本 |
| Zombie processes running but socket missing | 僵尸进程正在运行但缺少套接字 |
| Could not parse status | 无法解析状态 |
| tailscale status failed | tailscale 状态检查失败 |
| Homebrew — Funnel requires App Store or standalone install | Homebrew - Funnel 需要 App Store 或独立安装 |
| Funnel requires the App Store or standalone install. | Funnel 需要 App Store 或独立安装。 |
| claude binary not found — chat disabled | 未找到 claude 二进制文件 - 聊天已禁用 |
| Failed to connect to chat service. | 连接聊天服务失败。 |
| Chat request timed out after 30 seconds. | 聊天请求在 30 秒后超时。 |
| Chat not found | 未找到聊天 |
| Context window was full. Starting a fresh conversation. | 上下文窗口已满。正在开始新的对话。 |

---

## 成功与状态消息

| 英文 | 中文 |
|------|------|
| Created card | 已创建卡片 |
| Auth complete | 认证完成 |
| Connected! | 已连接！ |
| Saved | 已保存 |
| Saving... | 保存中... |
| Verifying... | 验证中... |
| Loading... | 加载中... |
| Installing... | 安装中... |
| Installed! | 已安装！ |
| Redirecting... | 重定向中... |
| Checking for updates... | 正在检查更新... |
| Everything is up to date. | 一切已是最新版本。 |
| Starting update... | 正在开始更新... |
| Update completed successfully. | 更新成功完成。 |
| Everything is already up to date. | 一切已是最新版本。 |
| Update failed verification — rolled back to previous version. | 更新验证失败 - 已回滚到上一版本。 |
| Update failed. Check logs for details. | 更新失败。请查看日志了解详情。 |
| Rollback complete. | 回滚完成。 |
| Some repos failed to rollback. | 部分仓库回滚失败。 |
| Connecting to Mullvad VPN... | 正在连接 Mullvad VPN... |
| Connected! | 已连接！ |
| Disconnecting from Mullvad VPN... | 正在断开 Mullvad VPN... |
| Disconnected! | 已断开！ |
| Mullvad is healthy. | Mullvad 运行正常。 |
| Key saved to vault | 密钥已保存到保险库 |
| Layer added to canvas | 图层已添加到画布 |
| Layer updated | 图层已更新 |
| All checks passed | 所有检查通过 |
| Some checks had issues. You can continue — these can be fixed later with mc-doctor. | 部分检查有问题。您可以继续 - 这些可以稍后通过 mc-doctor 修复。 |
| Test message sent — check your Telegram! | 测试消息已发送 - 请检查您的 Telegram！ |
| Email verified — continuing... | 邮箱已验证 - 继续中... |
| VPN configured — auto-connect enabled | VPN 已配置 - 自动连接已启用 |
| Wiki updated successfully. | Wiki 更新成功。 |
| All checks passed. Tailscale is healthy. | 所有检查通过。Tailscale 运行正常。 |
| Serve stopped. | Serve 已停止。 |
| Serving port within tailnet. | 正在 tailnet 内服务端口。 |
| Funnel stopped. | Funnel 已停止。 |
| Funnel config reset. | Funnel 配置已重置。 |
| Funneling port to the internet. | 正在将端口通过 funnel 公开到互联网。 |
| Applied | 已应用 |
| Dependencies installed. | 依赖已安装。 |
| Installing VendingBench 2 dependencies... | 正在安装 VendingBench 2 依赖... |
| mc-web-chat: not running | mc-web-chat：未运行 |
| Untitled chat | 无标题聊天 |

---

## Web UI — 设置向导

### step-meet（创建助手）
| 英文 | 中文 |
|------|------|
| Create your assistant | 创建你的助手 |
| Choose a character | 选择一个角色 |
| Upload your own | 上传自定义头像 |
| Name | 名字 |
| e.g. Nova, Atlas, Luna... | 例如 Nova、Atlas、Luna... |
| Nickname | 昵称 |
| Only letters, numbers, dashes, and underscores | 只允许字母、数字、连字符和下划线 |
| Color | 颜色 |
| Pronouns | 代词 |
| she/her | 她 |
| he/him | 他 |
| they/them | 他们 |
| Teal | 青色 |
| Pink | 粉色 |
| Purple | 紫色 |
| Red | 红色 |
| Orange | 橙色 |
| Blue | 蓝色 |
| White | 白色 |
| Continue → | 继续 → |
| Found your previous OpenClaw install | 发现您之前的 OpenClaw 安装 |
| Don't worry — your original data has been copied to: | 别担心 - 您的原始数据已复制到： |

### step-anthropic（Claude 设置）
| 英文 | 中文 |
|------|------|
| How {name} thinks | {name} 的思维方式 |
| {name} needs a brain to work — that brain is Claude, made by a company called Anthropic... | {name} 需要一个大脑来工作 - 这个大脑是 Claude，由一家叫 Anthropic 的公司开发... |
| Chatting | 聊天 |
| Asking questions, getting advice, having a conversation | 提问、获取建议、进行对话 |
| Working in the background | 后台工作 |
| Checking your email, organizing your tasks, running scheduled jobs — even while you sleep | 检查邮件、整理任务、运行定时任务 - 即使你在睡觉 |
| Harder tasks use more | 更难的任务消耗更多 |
| A quick answer is cheap. Writing a long email or researching something takes more... | 快速回答很便宜。撰写长邮件或研究某些内容则需要更多... |
| Why a subscription? | 为什么需要订阅？ |
| A subscription is much cheaper than paying per use... | 订阅比按次付费便宜得多... |
| ← Back | ← 返回 |
| Choose a plan → | 选择套餐 → |
| Pick your plan | 选择你的套餐 |
| Choose based on how much you expect {name} to do... | 根据你期望 {name} 做多少事来选择... |
| Light | 轻度 |
| Average | 中度 |
| Power | 重度 |
| $20/mo | $20/月 |
| $100/mo | $100/月 |
| $200/mo | $200/月 |
| Check in a few times a day, ask quick questions | 每天查看几次，提一些简单问题 |
| recommended | 推荐 |
| Use throughout the day — email, tasks, and scheduling | 全天使用 - 邮件、任务和日程安排 |
| All-day assistant — runs your business, handles everything | 全天候助手 - 管理您的业务，处理一切 |
| Sign up for Claude → | 注册 Claude → |
| I already have my Claude subscription | 我已经有 Claude 订阅了 |
| Connect your Claude account | 连接你的 Claude 账户 |
| Click the button below and sign in to your Claude account... | 点击下方按钮并登录您的 Claude 账户... |
| Waiting for you to sign in... | 等待您登录... |
| A browser window should have opened... | 应该已打开一个浏览器窗口... |
| Connected! | 已连接！ |
| If you received a code to paste, enter it here: | 如果您收到了要粘贴的代码，请在此输入： |
| Paste code here... | 在此粘贴代码... |
| Submit code | 提交代码 |
| Sign in to Claude | 登录 Claude |
| Waiting for sign-in... | 等待登录中... |

### step-gemini（Gemini 设置）
| 英文 | 中文 |
|------|------|
| Gemini API key | Gemini API 密钥 |
| Optional | 可选 |
| Enables image understanding and vision features. You can add this later in settings. | 启用图像理解和视觉功能。您可以稍后在设置中添加。 |
| API key | API 密钥 |
| AIza... | AIza... |
| Get a free key at aistudio.google.com — stored encrypted on your device | 在 aistudio.google.com 获取免费密钥 - 加密存储在您的设备上 |
| What Gemini unlocks | Gemini 解锁的功能 |
| Image and attachment understanding in emails | 邮件中的图像和附件理解 |
| Visual content generation | 视觉内容生成 |
| Document and photo analysis | 文档和照片分析 |
| Skip | 跳过 |
| Save & continue → | 保存并继续 → |
| ✓ Saved | ✓ 已保存 |

### step-github（GitHub 设置）
| 英文 | 中文 |
|------|------|
| GitHub | GitHub |
| Optional — but powerful. | 可选 - 但功能强大。 |
| With GitHub access, {name} can: | 有了 GitHub 权限，{name} 可以： |
| Build software with you — clone repos, push branches, open PRs | 与你一起构建软件 - 克隆仓库、推送分支、打开 PR |
| Research and analyze — explore code, read issues, review PRs | 研究和分析 - 浏览代码、阅读 Issues、审查 PR |
| Upgrade herself — write custom tools and plugins... | 升级自己 - 编写自定义工具和插件... |
| She writes tools that only you and her can use... | 她编写只有你和她能使用的工具... |
| 1. If you don't have a GitHub account, sign up here (it's free). | 1. 如果您没有 GitHub 账户，请在此注册（免费）。 |
| 2. Create a personal access token: | 2. 创建个人访问令牌： |
| a. Go to github.com/settings/tokens/new | a. 前往 github.com/settings/tokens/new |
| b. Note: {name} access | b. 备注：{name} 访问 |
| c. Expiration: No expiration | c. 有效期：永不过期 |
| d. Scopes: check every top-level checkbox (repo, workflow, admin:org, etc.) | d. 权限范围：勾选每个顶级复选框（repo、workflow、admin:org 等） |
| e. Click Generate token and copy it | e. 点击"生成令牌"并复制 |
| 3. Paste your token here: | 3. 在此粘贴您的令牌： |
| ghp_xxxxxxxxxxxxxxxxxxxx | ghp_xxxxxxxxxxxxxxxxxxxx |
| ✓ Connected as {username} | ✓ 已以 {username} 身份连接 |
| Verify token → | 验证令牌 → |
| Skip for now → | 暂时跳过 → |

### step-telegram（Telegram 设置）
| 英文 | 中文 |
|------|------|
| Connect Telegram | 连接 Telegram |
| Telegram is the secure channel between you and {name}. | Telegram 是你和 {name} 之间的安全通道。 |
| 1. Open Telegram on your phone. Find @BotFather, send /newbot... | 1. 在手机上打开 Telegram。找到 @BotFather，发送 /newbot... |
| 2. BotFather gives you a bot token. Email it to yourself... | 2. BotFather 会给你一个机器人令牌。通过邮件发给自己... |
| bot token | 机器人令牌 |
| 123456:ABC-DEF... | 123456:ABC-DEF... |
| 3. Send a Telegram message from your phone to {botName} so it can reply to you. | 3. 从手机向 {botName} 发送 Telegram 消息，以便它能回复你。 |
| 4. Find @userinfobot in Telegram, send it anything... | 4. 在 Telegram 中找到 @userinfobot，发送任意消息... |
| user ID | 用户 ID |
| 123456789 | 123456789 |
| Send test message → | 发送测试消息 → |
| Sending test... | 正在发送测试... |
| ✓ Test message sent — check your Telegram! | ✓ 测试消息已发送 - 请检查您的 Telegram！ |

### step-email（邮件设置）
| 英文 | 中文 |
|------|------|
| Email | 邮件 |
| Optional — but this is how your AM works independently. | 可选 - 但这是您的代理独立工作的方式。 |
| Email is the universal API. With an inbox, your AM can: | 邮件是通用的 API。有了收件箱，您的代理可以： |
| Act as your agent — send emails, reply to messages, follow up on your behalf | 作为您的代理 - 发送邮件、回复消息、代您跟进 |
| Triage your inbox — classify, prioritize, and surface what matters | 分类您的收件箱 - 分类、优先排序、突出重要内容 |
| Work autonomously — interact with services, receive confirmations, handle account workflows | 自主工作 - 与服务交互、接收确认、处理账户工作流 |
| We recommend creating a dedicated Gmail address... | 我们建议创建一个专用的 Gmail 地址... |
| Email address | 邮箱地址 |
| you@example.com | you@example.com |
| Gmail detected — using Google IMAP | 检测到 Gmail - 使用 Google IMAP |
| App password | 应用密码 |
| Password | 密码 |
| How to create one? | 如何创建？ |
| Hide instructions | 隐藏说明 |
| xxxx xxxx xxxx xxxx | xxxx xxxx xxxx xxxx |
| Your email password | 您的邮箱密码 |
| SMTP host | SMTP 主机 |
| smtp.example.com | smtp.example.com |
| Port | 端口 |
| Creating a Google App Password: | 创建 Google 应用密码： |
| Go to myaccount.google.com | 前往 myaccount.google.com |
| Select Security → 2-Step Verification | 选择"安全" → "两步验证" |
| Scroll down to App passwords | 向下滚动到"应用密码" |
| Create a new app password — name it "AM Assistant" | 创建新的应用密码 - 命名为 "AM Assistant" |
| Copy the 16-character code and paste it above | 复制 16 位字符代码并粘贴到上方 |
| Note: 2-Step Verification must be enabled on your account first. | 注意：必须先在您的账户上启用两步验证。 |
| Verify & continue → | 验证并继续 → |

### step-vpn（VPN 设置）
| 英文 | 中文 |
|------|------|
| VPN | VPN |
| Optional — but highly encouraged for social media and contact mining. | 可选 - 但强烈建议用于社交媒体和联系人挖掘。 |
| A VPN protects {name} when: | 当以下情况时，VPN 保护 {name}： |
| Browsing social media — prevents IP-based rate limiting and tracking | 浏览社交媒体 - 防止基于 IP 的速率限制和跟踪 |
| Contact mining — protects your identity when researching leads | 联系人挖掘 - 在研究潜在客户时保护您的身份 |
| Web scraping — avoids IP bans from automated browsing | 网页抓取 - 避免自动浏览导致的 IP 封禁 |
| MiniClaw uses Mullvad VPN — no account email, no logging, pay anonymously. | MiniClaw 使用 Mullvad VPN - 无需注册邮箱、不记录日志、匿名付款。 |
| Mullvad is not installed. Install it first... | Mullvad 未安装。请先安装... |
| Download Mullvad for macOS → | 下载 macOS 版 Mullvad → |
| Mullvad {version} detected... | 检测到 Mullvad {version}... |
| 1. Create a Mullvad account (no email required): | 1. 创建 Mullvad 账户（无需邮箱）： |
| 2. Add time to your account (from $5/month): | 2. 为您的账户充值（起价 $5/月）： |
| Fund your account → | 为您的账户充值 → |
| 3. Paste your account number: | 3. 粘贴您的账户号码： |
| 1234 5678 9012 3456 | 1234 5678 9012 3456 |
| 16-digit number from your Mullvad account page... | Mullvad 账户页面上的 16 位数字... |
| 4. Default relay country: | 4. 默认中继国家： |
| United States | 美国 |
| United Kingdom | 英国 |
| Canada | 加拿大 |
| Germany | 德国 |
| Netherlands | 荷兰 |
| Sweden | 瑞典 |
| Switzerland | 瑞士 |
| Japan | 日本 |
| Australia | 澳大利亚 |
| Singapore | 新加坡 |
| France | 法国 |
| Finland | 芬兰 |
| Norway | 挪威 |
| Denmark | 丹麦 |
| Austria | 奥地利 |
| Spain | 西班牙 |
| Italy | 意大利 |
| Brazil | 巴西 |
| {name} can switch countries on the fly... | {name} 可以随时切换国家... |
| ✓ VPN configured — auto-connect enabled | ✓ VPN 已配置 - 自动连接已启用 |
| Save & continue → | 保存并继续 → |

### step-color（颜色选择）
| 英文 | 中文 |
|------|------|
| Choose her look | 选择她的外观 |
| Pick an accent color. You can change it later. | 选择一个强调色。您可以稍后更改。 |
| Online · Ready | 在线 · 就绪 |

### step-install（安装）
| 英文 | 中文 |
|------|------|
| Install MiniClaw | 安装 MiniClaw |
| This will set up everything your AM needs to run. Enter your Mac password to begin. | 这将设置您的代理运行所需的一切。输入您的 Mac 密码开始。 |
| Mac password | Mac 密码 |
| Your password is only used locally for installing system packages. It is never stored or sent anywhere. | 您的密码仅在本地用于安装系统包。它不会被存储或发送到任何地方。 |
| Install → | 安装 → |
| Checking... | 检查中... |
| Installed! | 已安装！ |
| Install issue | 安装问题 |
| Everything is set up. Moving on... | 一切设置完毕。继续中... |
| Something went wrong. Check the output below. | 出了些问题。请查看下方的输出。 |
| This takes a few minutes. Sit tight. | 这需要几分钟。请稍候。 |
| ✓ Installation complete — continuing setup... | ✓ 安装完成 - 继续设置... |
| ← Try again | ← 重试 |
| Continue anyway → | 仍然继续 → |

### step-update-time（更新时间）
| 英文 | 中文 |
|------|------|
| Nightly updates | 每晚更新 |
| {name} can check for updates automatically each night... | {name} 可以每晚自动检查更新... |
| When should updates run? | 更新应该在什么时候运行？ |
| Pick a time when your Mac is on but you're not using it. Updates usually take under a minute. | 选择 Mac 开着但你不在使用时的时间。更新通常不到一分钟。 |
| Safe & automatic | 安全且自动 |
| Before updating, {name} takes a backup. After updating, a health check runs... | 更新前，{name} 会创建备份。更新后，会运行健康检查... |

### step-installing（安装进行中）
| 英文 | 中文 |
|------|------|
| Finishing up... | 即将完成... |
| Installing and configuring {name} | 正在安装和配置 {name} |
| Saving your preferences | 保存您的偏好设置 |
| Waiting for install to finish | 等待安装完成 |
| Saving your credentials | 保存您的凭证 |
| Configuring Telegram | 配置 Telegram |
| Connecting to gateway | 连接网关 |
| Hacking the matrix | 正在入侵矩阵 |
| Coming online | 即将上线 |
| Preferences saved | 偏好设置已保存 |
| Failed to save config | 保存配置失败 |
| Installed | 已安装 |
| Install timed out | 安装超时 |
| Credentials secured | 凭证已安全保存 |
| secret(s) failed | 个密钥保存失败 |
| Could not save credentials | 无法保存凭证 |
| Gateway running | 网关运行中 |
| Could not start gateway | 无法启动网关 |
| Taking you to {name}... | 正在带您前往 {name}... |

### step-done（完成）
| 英文 | 中文 |
|------|------|
| {name} is ready. | {name} 已就绪。 |
| Taking you to the brain board now. | 正在带您前往大脑看板。 |
| Redirecting to brain board... | 正在重定向到大脑看板... |

---

## Web UI — 看板与组件

### 看板列名
| 英文 | 中文 |
|------|------|
| Backlog | 待办 |
| In Progress | 进行中 |
| In Review | 审核中 |
| Shipped | 已完成 |

### 卡片模态框 — 区块标签
| 英文 | 中文 |
|------|------|
| Work Description | 工作描述 |
| Plan | 计划 |
| Criteria | 验收标准 |
| Notes | 备注 |
| Research | 研究 |
| Review | 审核 |

### 分类控制
| 英文 | 中文 |
|------|------|
| Disable scheduler | 禁用调度器 |
| Enable scheduler | 启用调度器 |
| on | 开 |
| off | 关 |
| Triage backlog cards | 分类待办卡片 |
| No cards to triage | 没有需要分类的卡片 |
| Triage | 分类 |
| Work top {n} card(s) | 处理前 {n} 张卡片 |
| No cards to work | 没有需要处理的卡片 |
| Work | 处理 |

### 时间间隔
| 英文 | 中文 |
|------|------|
| 1m | 1分钟 |
| 5m | 5分钟 |
| 10m | 10分钟 |
| 15m | 15分钟 |
| 30m | 30分钟 |
| 60m | 60分钟 |

### 并发选项
| 英文 | 中文 |
|------|------|
| 1× | 1× |
| 3× | 3× |
| 5× | 5× |
| 10× | 10× |

### 应用导航
| 英文 | 中文 |
|------|------|
| board | 看板 |
| memory | 记忆 |
| rolodex | 联系人 |
| agents | 代理 |
| settings | 设置 |
| tokens | 令牌 |

### 记忆标签页
| 英文 | 中文 |
|------|------|
| Loading... | 加载中... |
| No entries | 没有条目 |

### 定时任务标签页
| 英文 | 中文 |
|------|------|
| Scheduling | 调度 |
| Jobs | 任务 |
| No jobs | 没有任务 |
| Recent Runs | 最近运行 |
| No runs | 没有运行记录 |
| OK | 正常 |
| ERROR | 错误 |

### 联系人标签页 — 信任状态
| 英文 | 中文 |
|------|------|
| verified | 已验证 |
| pending | 待验证 |
| untrusted | 不可信 |
| unknown | 未知 |
| Click to copy | 点击复制 |

### 摘要模态框
| 英文 | 中文 |
|------|------|
| Last Hour — Work Done | 过去一小时 — 已完成工作 |
| log entries across {n} cards | 条日志跨 {n} 张卡片 |

### Toast 消息图标
| 英文 | 中文 |
|------|------|
| pickup | 领取 |
| release | 释放 |
| move | 移动 |
| ship | 发布 |
| create | 创建 |
| edit | 编辑 |

---

## Web UI — 设置页面

### 导航项
| 英文 | 中文 |
|------|------|
| General | 通用 |
| Telegram | Telegram |
| GitHub | GitHub |
| Email | 邮件 |
| Gemini | Gemini |
| Claude | Claude |
| VPN | VPN |

### 密码确认模态框
| 英文 | 中文 |
|------|------|
| Confirm Password | 确认密码 |
| Enter your current password to save changes to sensitive fields. | 输入当前密码以保存敏感字段的更改。 |
| Current Password | 当前密码 |
| Enter password | 输入密码 |
| Cancel | 取消 |
| Confirm | 确认 |

---

## Shell 脚本输出

### ensure-card.sh
| 英文 | 中文 |
|------|------|
| ⚠️ Branch references #{issue_num} but no GitHub issue found | ⚠️ 分支引用了 #{issue_num} 但未找到 GitHub Issue |
| 📋 Creating board card for #{issue_num}: {title} | 📋 正在为 #{issue_num} 创建看板卡片：{title} |
| ✓ Card created | ✓ 卡片已创建 |

### clean.sh
| 英文 | 中文 |
|------|------|
| Cleaning miniclaw/openclaw... | 正在清理 miniclaw/openclaw... |
| Stopping services... | 正在停止服务... |
| Killing processes... | 正在终止进程... |
| Removing LaunchAgents... | 正在移除 LaunchAgents... |
| Deleting ~/.openclaw... | 正在删除 ~/.openclaw... |
| ~/.openclaw already gone | ~/.openclaw 已经不存在了 |
| ✓ Clean. Ready for fresh install. | ✓ 已清理。准备全新安装。 |

### version.sh
| 英文 | 中文 |
|------|------|
| Error: MANIFEST.json not found at {path} | 错误：在 {path} 未找到 MANIFEST.json |
| Current version: {version} | 当前版本：{version} |

### watch-board.sh
| 英文 | 中文 |
|------|------|
| Watching board for {minutes} minutes | 监控看板 {minutes} 分钟 |
| PICKUP | 领取 |
| RELEASE | 释放 |
| STALE | 停滞 |
| MOVE | 移动 |
| SHIP | 发布 |
| CREATE | 创建 |
| BOARD HEALTH REPORT | 看板健康报告 |
| Activity: | 活动： |
| Pickups | 领取次数 |
| Releases | 释放次数 |
| Moves | 移动次数 |
| Ships | 发布次数 |
| Stale (>3min no move) | 停滞（>3分钟无移动） |
| Throughput (projected/hr): | 吞吐量（预计/小时）： |
| Column moves | 列移动 |
| Tuning assessment: | 调优评估： |
| NO ACTIVITY — workers not running or cron not firing | 无活动 - 工作进程未运行或定时任务未触发 |
| Workers picking up cards but NOT moving them — likely blocked on transitions | 工作进程领取了卡片但未移动 - 可能在转换时被阻塞 |
| UNDER-TUNED — too many pickups with no progress | 调优不足 - 领取过多但无进展 |
| WELL-TUNED — workers picking up and making progress | 调优良好 - 工作进程在领取并推进 |
| SHIPPING — {count} card(s) shipped | 发布中 - {count} 张卡片已发布 |
| ACTIVE — picking up and moving cards, some stalls expected | 活跃 - 正在领取和移动卡片，部分停顿属正常 |
| Low signal — run again for a longer window | 信号不足 - 请延长监控时间重试 |

### release.sh
| 英文 | 中文 |
|------|------|
| Releasing miniclaw-os {version} | 发布 miniclaw-os {version} |
| Building board web... | 正在构建看板 Web... |
| ✓ Build OK | ✓ 构建成功 |
| Pre-building plugins... | 正在预构建插件... |
| Merging shared dependencies... | 正在合并共享依赖... |
| shared dependencies | 个共享依赖 |
| Installing shared dependencies... | 正在安装共享依赖... |
| plugins pre-built (shared node_modules) | 个插件已预构建（共享 node_modules） |
| Packaging installer... | 正在打包安装程序... |
| ✓ Workspace templates bundled ({count} files) | ✓ 工作区模板已打包（{count} 个文件） |
| workspace/ not found in repo — skipping template bundle | 仓库中未找到 workspace/ — 跳过模板打包 |
| Tagging {version}... | 正在标记 {version}... |
| Tagging stable... | 正在标记 stable... |
| ✓ Tags pushed | ✓ 标签已推送 |
| Creating GitHub release... | 正在创建 GitHub Release... |
| Done: miniclaw-os {version} | 完成：miniclaw-os {version} |

### push-wiki.sh
| 英文 | 中文 |
|------|------|
| Cloning wiki repo... | 正在克隆 Wiki 仓库... |
| Copying wiki pages... | 正在复制 Wiki 页面... |
| Wiki updated successfully. | Wiki 更新成功。 |

---

## 工具定义 — 工具名称与描述

### mc-authenticator
| 英文 | 中文 |
|------|------|
| Auth Code | 认证码 |
| Get the current TOTP 2FA code for a service. Returns the 6-digit code and seconds until expiry. | 获取服务的当前 TOTP 双因素验证码。返回 6 位验证码和到期剩余秒数。 |
| Auth List | 认证列表 |
| List all stored TOTP services with issuer and account info. | 列出所有存储的 TOTP 服务及其颁发者和账户信息。 |
| Auth Time Remaining | 认证剩余时间 |
| Seconds until the current TOTP code expires. Useful to decide whether to use the current code or wait. | 当前 TOTP 验证码到期前的秒数。有助于决定是使用当前验证码还是等待。 |

### mc-backup
| 英文 | 中文 |
|------|------|
| Create Backup | 创建备份 |
| Create a tgz backup of the entire openclaw state directory and prune old archives per the tiered retention policy. Returns the backup path and size. | 创建整个 openclaw 状态目录的 tgz 备份，并按分层保留策略清理旧存档。返回备份路径和大小。 |
| List Backups | 列出备份 |
| List all backup archives with dates and sizes. Use this to check backup health or find a specific restore point. | 列出所有备份存档及其日期和大小。用于检查备份健康状况或查找特定还原点。 |

### mc-blog
| 英文 | 中文 |
|------|------|
| Blog Voice Rules | 博客写作风格规则 |
| Get the writing voice rules for blog posts. Call this BEFORE writing any blog content to load the persona's tone, banned words, patterns to follow, and anti-patterns to avoid. | 获取博客文章的写作风格规则。在编写任何博客内容之前调用此工具，以加载角色的语调、禁用词、要遵循的模式和要避免的反模式。 |
| Blog Arc Context | 博客系列上下文 |
| Get the current arc plan — weekly/seasonal themes, voice shifts, and seed ideas. | 获取当前系列计划 - 每周/季节性主题、风格变化和种子创意。 |

### mc-board
| 英文 | 中文 |
|------|------|
| Board Create | 看板创建 |
| Create a card on the kanban board. | 在看板上创建卡片。 |
| Board Update | 看板更新 |
| Update fields on a board card. | 更新看板卡片的字段。 |
| Board Move | 看板移动 |
| Move a card to a different column. | 将卡片移动到不同的列。 |
| Board Show | 看板显示 |
| Show full details for a board card. | 显示看板卡片的完整详情。 |
| Board List | 看板列表 |
| List cards on the board, optionally filtered by column/priority/tag. | 列出看板上的卡片，可按列/优先级/标签筛选。 |

### mc-booking
| 英文 | 中文 |
|------|------|
| Booking Create | 创建预约 |
| Create a new booking request. | 创建新的预约请求。 |
| Booking Approve | 批准预约 |
| Approve a pending booking request. | 批准待处理的预约请求。 |
| Booking Cancel | 取消预约 |
| Cancel an appointment. | 取消预约。 |
| Booking List | 预约列表 |
| List all appointments. | 列出所有预约。 |

### mc-calendar
| 英文 | 中文 |
|------|------|
| Calendar List | 日历列表 |
| List upcoming calendar events. | 列出即将到来的日历事件。 |
| Calendar Create | 创建事件 |
| Create a new calendar event. | 创建新的日历事件。 |
| Calendar Update | 更新事件 |
| Update an existing calendar event. | 更新现有的日历事件。 |
| Calendar Delete | 删除事件 |
| Delete a calendar event by UID. | 通过 UID 删除日历事件。 |

### mc-designer
| 英文 | 中文 |
|------|------|
| Designer Generate | 设计师生成 |
| Generate an image from a text prompt and add it as a canvas layer. | 根据文字提示生成图像并将其添加为画布图层。 |
| Designer Edit | 设计师编辑 |
| Edit an existing canvas layer using AI instructions. | 使用 AI 指令编辑现有画布图层。 |
| Designer Composite | 设计师合成 |
| Flatten all layers in a canvas and export as PNG. | 合并画布中的所有图层并导出为 PNG。 |

### mc-email
| 英文 | 中文 |
|------|------|
| Email Read | 读取邮件 |
| Read inbox messages. | 读取收件箱消息。 |
| Email Send | 发送邮件 |
| Send an email. | 发送邮件。 |
| Email Triage | 邮件分类 |
| Auto-triage unread inbox messages. | 自动分类未读收件箱消息。 |
| Email Archive | 归档邮件 |
| Archive a message. | 归档消息。 |

### mc-github
| 英文 | 中文 |
|------|------|
| GitHub Issues | GitHub Issues |
| List or show GitHub issues. | 列出或显示 GitHub Issues。 |
| GitHub PRs | GitHub PR |
| List or show GitHub pull requests. | 列出或显示 GitHub 拉取请求。 |

### mc-kb
| 英文 | 中文 |
|------|------|
| KB Add | 知识库添加 |
| Add a new entry to the knowledge base. | 向知识库添加新条目。 |
| KB Search | 知识库搜索 |
| Search knowledge base entries using hybrid vector+keyword search. | 使用混合向量+关键词搜索知识库条目。 |
| KB Get | 知识库获取 |
| Get a knowledge base entry by ID. | 通过 ID 获取知识库条目。 |

### mc-memory
| 英文 | 中文 |
|------|------|
| Memory Search | 记忆搜索 |
| Search across all memory stores (KB, memos, episodic). | 搜索所有记忆存储（知识库、备忘录、情景记忆）。 |
| Memory Store | 记忆存储 |
| Store a new memory entry. | 存储新的记忆条目。 |

### mc-research
| 英文 | 中文 |
|------|------|
| Deep Research | 深度研究 |
| Run a deep research query via Perplexity. | 通过 Perplexity 运行深度研究查询。 |
| SERP Check | 搜索排名检查 |
| Check search engine ranking for a keyword. | 检查关键词的搜索引擎排名。 |

### mc-rolodex
| 英文 | 中文 |
|------|------|
| Contact Search | 联系人搜索 |
| Search contacts by name, email, phone, or tag. | 按姓名、邮箱、电话或标签搜索联系人。 |
| Contact Add | 添加联系人 |
| Add a new contact. | 添加新联系人。 |
| Contact Update | 更新联系人 |
| Update an existing contact. | 更新现有联系人。 |
| Contact Show | 显示联系人 |
| Show full details for a contact. | 显示联系人的完整详情。 |

### mc-social
| 英文 | 中文 |
|------|------|
| Social Metrics | 社交指标 |
| Show social engagement metrics. | 显示社交互动指标。 |

### mc-tailscale
| 英文 | 中文 |
|------|------|
| Tailscale Doctor | Tailscale 诊断 |
| Diagnose Tailscale issues — checks binary, daemon, socket, zombie processes, install method (Homebrew vs standalone), and connection state. | 诊断 Tailscale 问题 - 检查二进制文件、守护进程、套接字、僵尸进程、安装方式（Homebrew 与独立安装）和连接状态。 |
| Tailscale Status | Tailscale 状态 |
| Show current Tailscale state: connection status, hostname, IPs, peers, serve/funnel config, and certificate info. | 显示当前 Tailscale 状态：连接状态、主机名、IP、对等节点、serve/funnel 配置和证书信息。 |
| Tailscale Harden | Tailscale 安全加固 |
| Apply Tailscale hardening settings: shields-up, disable route acceptance, auto-updates, and Tailscale SSH. Use dry_run=true to preview commands. | 应用 Tailscale 安全加固设置：启用防护、禁用路由接受、自动更新和 Tailscale SSH。使用 dry_run=true 预览命令。 |
| Preview commands without applying | 预览命令但不应用 |

### mc-web-chat
| 英文 | 中文 |
|------|------|
| chat-with-ai | chat-with-ai |
| Start a chat session with Mike O'Neal's AI assistant. Send a message and receive an AI-powered response about MiniClaw, consulting, projects, or general inquiries. | 与 Mike O'Neal 的 AI 助手开始聊天会话。发送消息并收到关于 MiniClaw、咨询、项目或一般问题的 AI 回复。 |
| The message to send to the AI assistant | 发送给 AI 助手的消息 |

### mc-voice
| 英文 | 中文 |
|------|------|
| Transcribe | 转录 |
| Transcribe an audio file using whisper.cpp. | 使用 whisper.cpp 转录音频文件。 |
| Voice Record | 语音录制 |
| Record audio from the system microphone using sox. Returns the path to the recorded WAV file (16kHz mono). Requires a duration — the recording stops automatically after the specified seconds. | 使用 sox 从系统麦克风录制音频。返回录制的 WAV 文件路径（16kHz 单声道）。需要指定时长——录制将在指定秒数后自动停止。 |
| Recording duration in seconds (required) | 录制时长（秒）（必填） |

### mc-x
| 英文 | 中文 |
|------|------|
| Post Tweet | 发布推文 |
| Post a tweet to X/Twitter. | 向 X/Twitter 发布推文。 |
| Read Timeline | 阅读时间线 |
| Read the X/Twitter timeline. | 阅读 X/Twitter 时间线。 |

---

## 内部日志消息（供参考）

| 英文 | 中文 |
|------|------|
| [mc-kb] sqlite-vec unavailable — vector search disabled (FTS5-only mode) | [mc-kb] sqlite-vec 不可用 - 向量搜索已禁用（仅 FTS5 模式） |
| [mc-kb/embedder] Model loaded OK — vector search enabled | [mc-kb/embedder] 模型加载成功 - 向量搜索已启用 |
| [mc-kb/embedder] Using embedding daemon via Unix socket | [mc-kb/embedder] 通过 Unix 套接字使用嵌入守护进程 |
| [mc-kb/embedder] Daemon socket exists but not responding — falling back to in-process | [mc-kb/embedder] 守护进程套接字存在但无响应 - 回退到进程内模式 |
| [mc-kb/embedder] Daemon went away — falling back to in-process | [mc-kb/embedder] 守护进程已离线 - 回退到进程内模式 |
| [mc-kb/search] hybrid search | [mc-kb/search] 混合搜索 |
| [mc-kb/search] FTS+vec returned nothing — falling back to substring scan | [mc-kb/search] FTS+向量未返回结果 - 回退到子串扫描 |
| [mc-web-chat] WebSocket server on ws://127.0.0.1:{port} | [mc-web-chat] WebSocket 服务器运行在 ws://127.0.0.1:{port} |
| [mc-web-chat] spawning claude for session | [mc-web-chat] 正在为会话生成 claude 进程 |
| [mc-web-chat] claude exited | [mc-web-chat] claude 进程已退出 |
| [mc-web-chat] context pressure — scheduling restart | [mc-web-chat] 上下文压力 - 正在安排重启 |
| [mc-web-chat] context full — killing session | [mc-web-chat] 上下文已满 - 正在终止会话 |
| [mc-web-chat] workspace loaded files | [mc-web-chat] 工作区已加载文件 |
| [mc-web-chat] topic shift detected | [mc-web-chat] 检测到话题转换 |
| [mc-web-chat] cleaning up stale session | [mc-web-chat] 正在清理过期会话 |
| [mc-web-chat] archived session | [mc-web-chat] 已归档会话 |
| log rotated; previous archived | 日志已轮转；先前日志已归档 |
| log file size cap reached; suppressing writes | 日志文件大小达到上限；抑制写入 |

---

*此文件由 MiniClaw 从 miniclaw-os 源代码自动提取生成。*
*提取日期: 2026-03-22*
