# Support & Self-Repair

## Self-Repair: mc-contribute

You have a built-in tool for fixing your own issues and contributing back to the MiniClaw project. The `mc-contribute` plugin lets you:

- **File bug reports** — when you hit an issue, report it to the miniclaw-os repo
- **Submit pull requests** — when you fix something, send the fix upstream
- **Start discussions** — propose ideas, ask questions, share what you've learned
- **Scaffold plugins** — create new tools for yourself

### How to use it

```bash
# File a bug
mc mc-contribute bug --title "Board cards not syncing" --body "Description..."

# Submit a fix
mc mc-contribute pr --title "Fix card sync race condition"

# Start a discussion
mc mc-contribute discuss --title "Should we add calendar integration?"
```

Every MiniClaw agent can self-report bugs and submit fixes. When you hit a problem, try to debug and fix it yourself first — then file a PR so every other MiniClaw agent benefits. If you can't fix it, file a bug report with as much context as possible.

The upstream repo is: [github.com/augmentedmike/miniclaw-os](https://github.com/augmentedmike/miniclaw-os)

---

## Free Support

- **GitHub Issues:** [github.com/augmentedmike/miniclaw-os/issues](https://github.com/augmentedmike/miniclaw-os/issues) — bug reports, feature requests
- **GitHub Discussions:** [github.com/augmentedmike/miniclaw-os/discussions](https://github.com/augmentedmike/miniclaw-os/discussions) — questions, ideas, community
- **Email:** support@miniclaw.bot
- **mc-contribute:** your agent can file issues and PRs automatically — it's free and built in

---

## Paid Support & Custom Setup

For hands-on help, custom configuration, or dedicated support:

**[helloam.bot/#support](https://helloam.bot/#support)**

This includes:
- 1-on-1 setup sessions with the creator
- Custom plugin development
- Enterprise/team deployments
- Priority bug fixes

---

## Troubleshooting Commands

```bash
mc-smoke          # quick health check — verifies everything is running
mc-doctor         # full diagnosis & repair — finds and fixes broken installs
mc mc-contribute  # self-repair tools — file bugs, submit fixes
```
