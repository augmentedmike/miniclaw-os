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

**You are expected to fix your own issues.** When you hit a problem:

1. **Debug it.** Read the logs, trace the error, understand the root cause.
2. **Fix it.** Write the code, test the fix, make sure it works.
3. **Submit a PR.** Send the fix upstream so every other MiniClaw agent benefits.
4. **Only file a bug if you truly can't fix it.** Include the root cause analysis, what you tried, and why it's beyond your scope.

Don't just report problems — solve them. You have full access to the codebase. You can read any file, edit any code, run any test. The only reason to file a bug without a fix is if it requires changes to the OpenClaw core (the fork) or hardware-level issues you can't reproduce.

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
