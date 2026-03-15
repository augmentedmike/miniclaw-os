# Reviewing PRs for MiniClaw-OS

A structured checklist for maintainers and reviewer agents evaluating incoming pull requests.

---

## 1. Security Audit

This is the most important step. A merged backdoor is worse than a rejected feature.

- [ ] **No secrets or credentials** — no API keys, tokens, passwords, or PII anywhere in the diff
- [ ] **`./scripts/security-check.sh --all` passes** — run it yourself, don't trust the contributor's claim
- [ ] **No unexpected outbound network calls** — `fetch`, `axios`, `http.get`, `net.connect`, WebSocket usage must be justified and point to known endpoints
- [ ] **No unexpected filesystem writes** — writes outside the plugin's own directory or standard output paths (`~/am/media/`, `~/am/logs/`) are suspicious
- [ ] **No dependency additions without justification** — new entries in `package.json` must be explained; check the package on npm for maintainer reputation and download count
- [ ] **No permission escalation** — the PR should not request broader filesystem, network, or process access than the plugin needs
- [ ] **No eval, Function constructor, or dynamic code execution** — `eval()`, `new Function()`, `vm.runInNewContext()` are red flags
- [ ] **No hardcoded URLs to unknown services** — all external endpoints must be documented

## 2. Code Quality

Follow the project's [Coding Axioms](./CODING_AXIOMS.md).

- [ ] **TypeScript throughout** — no `.js` files in plugin source
- [ ] **Plugin structure matches the template** — `openclaw.plugin.json`, `package.json`, `index.ts`, `tools/definitions.ts`, `cli/commands.ts`
- [ ] **No cross-plugin direct imports** — plugins communicate through shared state, never `import from '../other-plugin/'`
- [ ] **Config resolved early** — no scattered `process.env` or `config.get()` calls deep in business logic
- [ ] **Secrets use the vault** — `mc-vault get`, never hardcoded or read from `.env`
- [ ] **One plugin, one job** — the PR doesn't smash unrelated functionality into a single plugin
- [ ] **No over-engineering** — no premature abstractions, no feature flags for hypothetical futures, no unnecessary helper modules
- [ ] **Error messages are actionable** — failures tell you what went wrong, what was expected, and what to do

## 3. Test Coverage

- [ ] **Plugin smoke test exists and passes** — `mc plugin test mc-<name>` should work
- [ ] **Pre-commit hook passes** — `./scripts/security-check.sh` runs clean on all committed files
- [ ] **Tests prove behavior, not coverage** — tests exercise real paths, not mocked abstractions
- [ ] **No snapshot tests for dynamic output** — snapshots that break on timestamps or UUIDs are noise

## 4. CI Checks

- [ ] **All GitHub Actions checks are green** — do not merge with red CI
- [ ] **No skipped or disabled tests** — `.skip`, `xit`, `xdescribe` should not appear in the diff
- [ ] **Build succeeds** — `npm run build` or `bun run build` completes without errors

## 5. Philosophical Alignment

Does this PR fit the MiniClaw way? See [PHILOSOPHY.md](./PHILOSOPHY.md).

- [ ] **One plugin, one job** — the cognitive function is clear and doesn't overlap with existing plugins
- [ ] **Brain region mapping makes sense** — the plugin's category (planning, memory, communication, creation, security, utility) is correct
- [ ] **CLI-first** — the feature is usable from the command line, not just as an agent tool
- [ ] **Deterministic over probabilistic** — logic is codified in tools, not left to model improvisation
- [ ] **No GUI-only workflows** — if it touches a browser, it should be building a CLI tool from the observation, not automating clicks

## 6. Identity & Trust

- [ ] **Clone identity present** — PRs from agents should include their clone identity in the PR body (mc-contribute appends this automatically)
- [ ] **Agent is known or vouched for** — check if the contributing agent/human has prior merged PRs or is vouched by a known contributor
- [ ] **PR body follows the template** — summary, affected plugins, test plan, and security checklist are all filled in

---

## Merge Criteria

A PR is mergeable when:

1. All security audit items pass (non-negotiable)
2. CI is green
3. Code quality items pass (minor style issues can be fixed post-merge)
4. At least one maintainer or trusted reviewer agent approves
5. The contributor has addressed all review comments

## When to Request Changes

- Any security concern — always block
- Missing tests for new functionality
- Cross-plugin imports or architectural violations
- Vague PR description that doesn't explain the "why"

## When to Close Without Merging

- The PR introduces functionality that duplicates an existing plugin
- The contributor is unresponsive to review feedback for 14+ days
- The change conflicts with the project philosophy and can't be reworked
