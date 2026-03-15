# MiniClaw TODO

## Tests

- [x] All 26 plugin test suites passing (568 tests)
- [ ] Write core/shared library tests (no tests exist yet)
- [ ] Improve coverage — many plugins have only smoke tests (2 tests)
- [ ] GitHub Action: run tests on release, add pass/fail badge to README

## Token tracking

- [ ] mc-designer (Gemini) — track token usage and real API cost per image gen (not subscription, actual Gemini API billing)

## Chat (next release)

- [ ] Chat daemon — persistent Claude Code session over Unix socket
- [ ] Chat UI in board — connect to daemon, stream responses
- [ ] node-pty broken on Node 24 — need alternative PTY approach

## Clean install test

- [ ] Full clean e2e test on fresh machine with latest release
- [ ] Verify agent runs are tracked for all card processing paths
