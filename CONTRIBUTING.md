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

## Development setup (manual)

If you're not using MiniClaw, the traditional setup works too:

```bash
git clone https://github.com/augmentedmike/miniclaw-os.git
cd miniclaw-os
```

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
