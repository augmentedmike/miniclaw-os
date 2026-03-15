# mc-contribute

**Brain region:** utility — the immune system's self-repair loop

mc-contribute is the contribution toolkit for the MiniClaw plugin ecosystem. It lets agents (and their humans) scaffold new plugins, file bug reports, submit feature requests, create PRs, and manage GitHub Discussions — all from the CLI or as agent tools.

## Why it matters

MiniClaw agents are autohealing software. When an agent hits a bug, it can use mc-contribute to file the issue with auto-collected diagnostics (mc-doctor output, macOS version, Node version). When it builds a new tool for itself, it can scaffold a proper plugin and submit a PR upstream. The issue and PR activity on this repo is largely agents self-reporting problems and contributing fixes.

## How it works

- **Context injection:** Every prompt in the miniclaw-os repo gets contribution rules prepended automatically via `before_prompt_build`. The agent always knows the rules without being told.
- **CLI commands:** `mc mc-contribute <subcommand>` for human use.
- **Agent tools:** 9 tools for autonomous contribution workflows.
- **Security-first:** All PRs run the security scanner before submission. Commits with secrets are blocked.

## CLI Commands

| Command | Description |
|---------|-------------|
| `scaffold <name>` | Scaffold a new plugin with correct structure |
| `branch <topic>` | Create a `contrib/<topic>` branch from main |
| `security [--all]` | Run security scanner (staged files or full repo) |
| `pr -t <title> -s <summary>` | Push branch and create PR (security check first) |
| `status` | Show branch, uncommitted changes, open PRs |
| `guidelines` | Print the full contribution guidelines |

## Agent Tools

| Tool | Description |
|------|-------------|
| `contribute_scaffold_plugin` | Scaffold a new plugin directory |
| `contribute_branch` | Create a contribution branch |
| `contribute_security_check` | Run the security scanner |
| `contribute_pr` | Push and create a PR |
| `contribute_status` | Check contribution status |
| `contribute_guidelines` | Get full contribution guidelines |
| `contribute_bug_report` | File a bug report with auto-diagnostics |
| `contribute_feature_request` | Submit a feature request or plugin idea |
| `contribute_discussion` | List or create GitHub Discussions |

## Agent Coordination (ref: GitHub issue #63)

mc-contribute enforces agent coordination to prevent multiple clones from colliding on the same issues:

- **Duplicate detection:** Before creating any issue or PR, the plugin searches for existing open items with similar titles using `gh issue list --search` / `gh pr list --search`.
- **Comment instead of duplicate:** If a match is found, mc-contribute automatically comments on the existing issue/PR with the agent's details instead of creating a new one.
- **Clone identity:** Every issue, PR, and comment includes the agent's clone identity (hostname, bot ID, state dir) for traceability.
- **Tools affected:** `contribute_pr`, `contribute_bug_report`, `contribute_feature_request` all perform duplicate checks before creation.

## Configuration

| Key | Default | Description |
|-----|---------|-------------|
| `upstreamRepo` | `augmentedmike/miniclaw-os` | GitHub repo for PRs and issues |
| `forkRemote` | `origin` | Git remote for pushing branches |

## Full documentation

See [docs/mc-contribute.md](../../docs/mc-contribute.md).
