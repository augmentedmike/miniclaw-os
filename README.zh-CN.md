[English](README.md) | [Español](README.es.md)

# MiniClaw

基于 [OpenClaw](https://github.com/openclaw) 构建自主 AI 代理的插件生态系统。

MiniClaw 为您的代理提供持久记忆、任务管理、联系人、邮件和知识库——所有功能都是模块化插件，可自由组合搭配。

## 插件

| 插件 | 描述 |
|------|------|
| **mc-board** | 带有强制状态机的看板任务面板（待办 → 进行中 → 审核中 → 已完成）。赋予代理"前额叶皮层"——跨会话的持久规划和跟进能力。 |
| **mc-kb** | 支持全文搜索的知识库。存储和检索结构化信息。 |
| **mc-email** | 邮件集成——发送、接收、分类。 |
| **mc-rolodex** | 联系人管理——添加、搜索、列表、更新、删除联系人。 |
| **shared/webmcp** | WebMCP 集成库，通过 Web Model Context Protocol 将代理工具暴露给 Chrome 146+。 |

## 快速开始

### 1. 克隆仓库

```bash
git clone https://github.com/anthropic/miniclaw-os.git
cd miniclaw-os
```

### 2. 选择配置方案

`examples/` 目录中提供了预设配置方案：

| 方案 | 插件数量 | 适用场景 |
|------|----------|----------|
| **Minimal（最小化）** | 6 个核心 | 本地优先的个人助手 |
| **Developer（开发者）** | 12 个 | 软件工程工作流 |
| **Content Creator（内容创作者）** | 14 个 | 写作与发布 |
| **Headless（无头模式）** | 全部 | 完整安装，包含所有凭证 |

```bash
cp examples/minimal.example.json my-config.json
# 填入您的凭证信息
```

### 3. 安装

```bash
./install.sh --config my-config.json
```

## 命令

每个插件通过 `openclaw` 注册 CLI 命令：

```bash
# 任务面板
openclaw mc-board create --title "修复认证问题" --priority high
openclaw mc-board board              # 完整看板视图
openclaw mc-board next               # 下一步做什么？

# 知识库
openclaw mc-kb search "部署步骤"
openclaw mc-kb add --title "API 密钥" --content "..."

# 邮件
openclaw mc-email inbox
openclaw mc-email send --to user@example.com --subject "你好"

# 联系人
openclaw mc-rolodex search "Alice"
openclaw mc-rolodex add --name "Alice" --email "alice@example.com"
```

## 项目结构

```
miniclaw-os/
├── mc-board/          # 任务面板插件 + Web 仪表盘
│   ├── docs/          # 文档
│   ├── web/           # Next.js Web 界面
│   └── src/           # 核心逻辑
├── mc-kb/             # 知识库插件
├── plugins/
│   ├── mc-email/      # 邮件插件
│   ├── mc-rolodex/    # 联系人插件
│   └── shared/
│       └── webmcp/    # WebMCP 集成库
└── examples/          # 配置方案
```

## 文档

- [mc-board 文档](mc-board/docs/README.md) — 任务面板架构与配置
- [示例配置](examples/README.md) — 预设配置方案
- [WebMCP 模式](plugins/shared/webmcp/WEBMCP-PATTERNS.md) — Web 集成参考

## 许可证

MIT
