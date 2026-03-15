# mc-contribute — Community Contribution Toolkit

mc-contribute helps agents and their humans contribute to the MiniClaw-OS repo. It scaffolds new plugins, creates branches, runs security checks, submits PRs, files bug reports, and manages GitHub Discussions.

---

## Upstream Reporting (Clone Swarm)

Every MiniClaw install reports upstream to `augmentedmike/miniclaw-os` by default. When any Amelia clone — anywhere in the world — hits a bug, it can file an issue automatically. When it builds a new tool, it can submit a PR. This means the issue tracker and PR activity on miniclaw-os is largely populated by agents self-reporting problems and contributing fixes.

Every bug report, feature request, and PR includes **clone identity** (hostname, bot ID, state directory) so maintainers can tell which clone filed what.

The upstream repo is configurable via `upstreamRepo` in plugin config, but defaults to the original repo so the swarm feeds back without any setup.

---

## Overview

The plugin injects a short contribution context into every prompt (via `before_prompt_build`) so the agent always knows the key rules when working in the miniclaw-os repo. Full guidelines are available on demand via the `contribute_guidelines` tool.

All git and GitHub operations use `gh` CLI and standard git commands under the hood.

---

## Agent Coordination

Multiple agents work on this repo simultaneously. Follow these rules to prevent collision:

1. **Search before you file.** Before creating a new issue, search existing issues and PRs (`gh issue list`, `gh pr list`). If the bug is already reported, comment on the existing issue instead of creating a duplicate.

2. **Label your work.** Every issue and PR you create must include your agent name as a label (e.g., `Amelia`, `Claude Code`). This is how other agents know who's working on what.

3. **Don't touch another agent's work.** If an issue has another agent's label, leave it alone. That agent is responsible for it. If you have relevant information, comment on the issue — don't take it over.

4. **Check before you pick up.** Before starting work on an unlabeled issue, add your label first. This claims it. If you see someone else's label when you go to add yours, back off.

5. **One agent, one branch.** Don't push to a branch another agent created. Create your own branch for your own issue.

6. **Contribute, don't compete.** If another agent filed a bug and you have the fix, comment with your solution on their issue. Don't file a new issue and a competing PR.

7. **NEVER tag stable.** Only the human moves the `stable` tag. Agents merge PRs to main — that's it. Tagging stable is a human decision that triggers CI and signals a release candidate. No agent has authority to make that call.

---

## Coding Standards

All contributions must follow the project's [Coding Axioms](../CODING_AXIOMS.md) — language-independent principles rooted in functional programming, composition, and clarity. Read them before contributing.

Key points: fail loudly, don't over-engineer, declarative over imperative, side effects at the edges, delete don't deprecate, tests prove behavior not coverage.

**Runtime: Node.js only.** No Bun. No `bun:*` imports, no `Bun.serve()`, no `bun:sqlite`, no `bun:test`. Use `better-sqlite3`, `vitest`, `node:fs`, `npm install -g`, `npx tsx`. The ESLint config enforces this in TypeScript. PRs with Bun references will be rejected.

---

## Security Hardening

mc-contribute is hardened against prompt injection and shell injection:

- **No shell interpolation.** All commands use `execFileSync` with argument arrays, never string interpolation into shell commands. User-provided titles, descriptions, and bodies never touch a shell.
- **Temp-file body passing.** PR bodies, issue bodies, and discussion bodies are written to a temp file and passed via `--body-file`. The file is deleted after use.
- **Input sanitization.** All user inputs pass through strict validators:
  - Plugin names and branch topics: alphanumeric + hyphens only, max 64 chars
  - Titles: shell-dangerous characters stripped, max 200 chars
  - Bodies: backticks, dollar signs, backslashes stripped, max 10,000 chars
  - Repo names: validated against `owner/name` format
  - File paths: path traversal (`../`, absolute paths, `~`) blocked
- **Config validation.** `upstreamRepo` and `forkRemote` are validated at plugin registration time.

---

## CLI Commands

All commands use `mc mc-contribute <subcommand>`.

### `scaffold <name>`
Scaffold a new plugin with the correct directory structure.

```
mc mc-contribute scaffold weather --description "Weather forecasts" --region utility
```

Creates `plugins/mc-<name>/` with `openclaw.plugin.json`, `package.json`, `index.ts`, `tools/definitions.ts`, `cli/commands.ts`, and `docs/README.md`.

### `branch <topic>`
Create a contribution branch following the `contrib/<topic>` naming convention.

```
mc mc-contribute branch mc-weather
```

### `security`
Run the security scanner on the repo.

```
mc mc-contribute security [--all]
```

Scans for hardcoded secrets, API keys, tokens, and PII. Default: staged files only. `--all`: full repo.

### `pr`
Submit a pull request to miniclaw-os. Runs security check first.

```
mc mc-contribute pr -t "Add weather plugin" -s "New mc-weather plugin with forecast tool"
```

### `bug <title>`
File a bug report with auto-collected diagnostics (mc-doctor output, versions, clone identity).

```
mc mc-contribute bug "mc-board crashes on empty backlog" -w "Board threw TypeError" -e "Should show empty state"
```

### `feature <title>`
Submit a feature request or plugin idea.

```
mc mc-contribute feature "Weather alerts" -p "No way to get weather data" -s "Add mc-weather plugin"
```

### `status`
Check contribution status — current branch, uncommitted changes, open PRs.

```
mc mc-contribute status
```

### `guidelines`
Print the full MiniClaw contribution guidelines.

```
mc mc-contribute guidelines
```

---

## Agent Tools

| Tool | Description |
|------|-------------|
| `contribute_scaffold_plugin` | Scaffold a new plugin with the full directory structure. Parameters: `pluginName`, `description`, `brainRegion` (all required). |
| `contribute_branch` | Create a `contrib/<topic>` branch from main. Parameter: `topic` (required). |
| `contribute_security_check` | Run the security scanner. Parameter: `scope` (optional: "staged" or "all"). |
| `contribute_pr` | Push branch and create a PR to upstream. Runs security check first. Parameters: `title`, `summary` (required); `pluginsAffected` (optional). |
| `contribute_status` | Show current branch, uncommitted changes, recent commits, and open PRs. |
| `contribute_guidelines` | Return the full MiniClaw contribution guidelines. Read this before making any contribution. |
| `contribute_bug_report` | File a bug report issue. Auto-collects environment info (macOS, Node, mc version), clone identity, and mc-doctor output. Parameters: `title`, `whatHappened`, `expected`, `stepsToReproduce` (required); `pluginsInvolved` (optional). |
| `contribute_feature_request` | Submit a feature request or plugin idea. Parameters: `title`, `problem`, `proposedSolution` (required); `brainRegion`, `isNewPlugin`, `pluginName`, `exampleUsage` (optional). |
| `contribute_discussion` | List or create GitHub Discussions. Parameters: `action` (required: "list" or "create"); `title`, `body`, `category` (for create). |

---

## Configuration

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| `upstreamRepo` | string | `augmentedmike/miniclaw-os` | GitHub repo for PRs and issues — all clones report here by default |
| `forkRemote` | string | `origin` | Git remote name for pushing branches |

---

## Contribution Guidelines Summary

- One plugin, one job. No combined unrelated functionality.
- TypeScript for all plugin code. Tools return `{ content: [{ type: "text", text }], details: {} }`.
- Use the vault for secrets. Never hardcode tokens, keys, or passwords.
- The pre-commit hook (`scripts/security-check.sh`) blocks commits with secrets.
- Branch naming: `contrib/<plugin-name>`, `contrib/fix-<description>`, `contrib/docs-<topic>`.
- PR titles under 70 characters. Include summary bullets and affected plugins.
