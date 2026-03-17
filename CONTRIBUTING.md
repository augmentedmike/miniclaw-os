# Contributing to MiniClaw

Thanks for your interest in MiniClaw. Here's how to get involved.

## Ways to contribute

- **Report bugs** — [open an issue](https://github.com/augmentedmike/miniclaw-os/issues/new?template=bug_report.md)
- **Request features** — [open a feature request](https://github.com/augmentedmike/miniclaw-os/issues/new?template=feature_request.md)
- **Propose a plugin** — [submit a plugin idea](https://github.com/augmentedmike/miniclaw-os/issues/new?template=plugin_idea.md)
- **Fix a bug or add a feature** — fork, branch, PR
- **Improve docs** — wiki, README, plugin docs
- **Join the discussion** — [GitHub Discussions](https://github.com/augmentedmike/miniclaw-os/discussions)

## Contributing with MiniClaw

MiniClaw is built with MiniClaw. If you have it installed, your agent can help you contribute.

### Create a task for your contribution

```bash
mc board create "Add fuzzy search to mc-rolodex" --priority medium --tags contribution
```

Your agent will fill in the implementation plan, acceptance criteria, and start working. You review and approve.

### Research the codebase

```bash
# Ask your agent to understand a plugin before modifying it
openclaw agent "Read the mc-board plugin and explain the state machine transitions"

# Search the knowledge base for related work
mc kb search "rolodex search"
```

### Build a new plugin

```bash
# Have your agent scaffold the plugin for you
openclaw agent "Create a new plugin called mc-weather following the structure in plugins/mc-kb"

# Or use the board to track the full build
mc board create "Build mc-weather plugin" --priority high
```

Your agent will follow the [Writing Plugins](https://github.com/augmentedmike/miniclaw-os/wiki/Writing-Plugins) guide, create the files, and test them.

### Generate a PR

```bash
# Your agent can draft the PR description from the card
openclaw agent "Create a PR for the mc-weather plugin based on card crd_abc123"
```

### Run the security check

```bash
# Your agent should do this automatically, but you can also ask
openclaw agent "Run the security check on the full repo and fix any issues"
```

The pre-commit hook runs `scripts/security-check.sh` on every commit automatically. Your agent respects it — commits with secrets will be blocked.

### Use mc-kb to learn from past contributions

Every time your agent ships a card, lessons are saved to mc-kb. Before starting a contribution, search for what's been learned:

```bash
mc kb search "plugin development"
mc kb search "common mistakes"
```

---

## Issue-Driven Development

Every change follows this cycle. No exceptions.

```
Issue → Branch → Work → Commit → PR → CI → Merge → Close
```

### The issue is the contract

The issue defines what gets done. Not more, not less. This is how agents and humans stay aligned — the issue constrains the scope, prevents hallucination, and creates an auditable trail.

- **No work without an issue.** If there's no issue, create one first.
- **The issue is the single source of truth.** If scope changes, update the issue. If you hit a blocker, comment on the issue. If you discover something, add it to the issue.
- **Close with a resolution.** Document what was done, which commits/files changed, and how to verify.

### Branch naming

```bash
git checkout -b fix/32-credentials-save-failing
git checkout -b feat/34-mc-github-plugin
git checkout -b chore/35-branch-workflow
```

Convention: `fix/`, `feat/`, `chore/`, `docs/` prefix + issue number + short slug.

### Commits reference issues

```bash
git commit -m "fix: vault init before credential persist

Resolves #32"
```

### PRs link to issues

Use `Fixes #N` in the PR body so issues auto-close on merge.

### CI must pass

The test suite runs on the `stable` tag. All tests must pass before tagging stable.

### Reference example: #33 (favicon)

[Issue #33](https://github.com/augmentedmike/miniclaw-os/issues/33) is the template:

1. Issue created with clear description
2. Work done, committed (`f264f93`)
3. Issue closed with resolution comment listing files changed and verification status

Every issue should look like this when it's done.

### Agent workflow (mc-board ↔ GitHub)

An agent's mc-board card maps 1:1 to a GitHub issue:

| mc-board state | GitHub state |
|---|---|
| backlog | issue open, no branch |
| in-progress | branch created, commits flowing |
| in-review | PR open, CI running |
| shipped | PR merged, issue closed |

mc-contribute handles the GitHub side. mc-github (planned, [#34](https://github.com/augmentedmike/miniclaw-os/issues/34)) will add full project management.

---

## Coding Standards

Follow [CODING_AXIOMS.md](./CODING_AXIOMS.md) — language-independent principles rooted in functional programming, composition, and clarity.

Key axioms: fail loudly, three lines > one abstraction, declarative over imperative, side effects at the edges, delete don't deprecate, tests prove behavior not coverage.

**Runtime: Node.js only.** No Bun. No `bun:*` imports, no `Bun.serve()`, no `bun:sqlite`, no `bun:test`. Use `better-sqlite3`, `vitest`, `node:fs`, `npm install -g`, `npx tsx`. PRs with Bun references will be rejected.

**File naming:** kebab-case only. `setup-wizard.tsx`, not `SetupWizard.tsx`.

---

## Development setup (manual)

If you're not using MiniClaw, the traditional setup works too:

```bash
git clone https://github.com/augmentedmike/miniclaw-os.git
cd miniclaw-os
```

### OpenClaw fork resolution

MiniClaw plugins resolve `openclaw` from a **local fork** via `file:` references in
`package.json`, not from the npm registry. This ensures you always run the same version
of openclaw core that you're developing against.

**Setup:**

```bash
# Clone the fork as a sibling of miniclaw-os under the same projects/ directory
git clone https://github.com/augmentedmike/openclaw.git ../openclaw
```

Each plugin's `devDependencies` declares:

```json
"openclaw": "file:../../../openclaw"
```

After `npm install`, `node_modules/openclaw` will be a symlink to the fork directory.

The `postinstall` script (`scripts/check-openclaw-fork.sh`) verifies the fork exists
and warns if it's missing. If you see a warning, clone the fork as shown above.

**Why not npm?** The published `@miniclaw_official/openclaw` package on npm may lag
behind the fork. Using `file:` references guarantees plugins always resolve to the
local fork — essential for testing patches, unreleased features, and keeping core +
plugin versions in sync.

The pre-commit hook (`scripts/security-check.sh`) runs automatically on every commit. It scans for hardcoded secrets, API keys, and PII. Do not bypass it.

## Pull request process

1. Fork the repo and create a branch from `main`
2. Make your changes
3. Run `./scripts/security-check.sh --all` to verify no secrets
4. Open a PR using the template
5. Wait for review

## Writing plugins

See the [Writing Plugins](https://github.com/augmentedmike/miniclaw-os/wiki/Writing-Plugins) wiki page for the full guide.

Quick version:

```
plugins/mc-my-plugin/
├── openclaw.plugin.json
├── package.json
├── index.ts
├── tools/
└── cli/
```

## Security

Never commit secrets, API keys, tokens, or personal information. The pre-commit hook will block it, but please be careful. If you find a security issue, please email security concerns to the maintainer rather than opening a public issue.

## Code style

- TypeScript for plugins
- Keep it simple — no over-engineering
- One plugin, one job
- Test your changes

## Release Process

Tagged versions (e.g. `v0.1.2`) are **prerelease candidates**, not stable.
The process:

1. Development work is completed and committed.
2. A version tag is created (`git tag -a vX.Y.Z`).
3. The tagged version is a candidate — the `stable` tag does **not** move yet.
4. The human team tests the release manually.
5. Only after human sign-off does the `stable` tag move to that version.
6. The bootstrap installer defaults to `stable`, so most users only get human-tested releases.

See [docs/RELEASING.md](./docs/RELEASING.md) for the full checklist.

## License

By contributing, you agree that your contributions will be licensed under the Apache 2.0 License.
