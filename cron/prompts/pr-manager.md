# PR Manager Cron — Automated PR Review

## Job
Review all open PRs on augmentedmike/miniclaw-os hourly with a rigorous, professional workflow covering 6 categories: security, attack vectors, merit, quality, usefulness, and harm prevention.

## Review Workflow

### 1. Security Checks
Scan for common vulnerabilities:
- Hardcoded secrets: API keys, tokens, passwords
- Shell injection: unescaped exec, eval, spawn
- Path traversal: user input in file paths without path.basename
- XSS vectors: unsanitized HTML rendering
- Dependency poisoning: suspicious new deps, typosquatting
- Exfiltration: unexpected network calls to unknown hosts

**Tool:** `gh pr view <pr> --json files,title,body` + pattern scanning for suspicious code patterns

### 2. Attack Vector Assessment
Check if PR modifies sensitive areas:
- Does NOT modify install.sh, vault, auth files without justification
- Does NOT weaken existing validation or gates
- Does NOT add backdoors disguised as features
- Contributor history: Check if new contributor → extra scrutiny

**Tool:** `gh api /repos/augmentedmike/miniclaw-os/pulls/<pr_number>` for contributor info

### 3. Merit Assessment
Does this PR add real value?
- Solves a real problem or adds genuine value
- Not busywork, not trivial reformatting, not scope creep
- Follows CODING_AXIOMS.md — fail loudly, no over-engineering

**Tool:** Read PR title, description, and diff summary

### 4. Quality Checks
- All tests pass: `npx vitest run` on the PR branch
- No regressions against recent commits
- New code has tests where appropriate
- Proper markdown in any card/doc content

**Tool:** `gh pr checkout <pr>` + `npx vitest run`

### 5. Usefulness Assessment
- Feature is something users or agents actually need
- Doesn't duplicate existing functionality
- Doesn't add unnecessary complexity

**Tool:** Check code diff and PR description

### 6. Non-Harmful Check
- No destructive operations without confirmation
- No data loss risk
- No privacy violations

**Tool:** Code review + common sense

## Attacker Protocol

1. Maintain a **known attacker list** in mc-kb (type=fact, tag=security)
2. If a PR shows attack patterns and contributor is on the list:
   - **DO NOT comment or review** — do NOT engage
   - Notify human via Telegram with full details:
     - PR link
     - What attack pattern was detected
     - Evidence (code snippet, file paths)
   - Log the attempt in mc-kb for pattern tracking
3. If PR is from unknown contributor with attack patterns:
   - Request human approval before commenting
   - Suggest fixes professionally but cautiously

## On Review Complete

### If all checks pass (green):
- Comment with positive summary: "✅ Looks good! [1-3 sentence summary]"
- Approve the PR: `gh pr review --approve`
- Check CI status: if green, merge: `gh pr merge --auto --squash`
- Create a board card: [PR title] — merged, what it delivers

### If issues found (yellow):
- Comment with findings in each category that failed
- Provide code examples for fixes
- Suggest without demanding: "Consider..." not "Must..."
- Do NOT approve yet
- Wait for contributor response

### If critical security issue (red):
- Comment with the issue
- Request changes: `gh pr review --request-changes`
- Notify human via Telegram immediately
- Do NOT merge until human approves

## Tone

**Polite, professional, kind, non-fussed.**
- Thank contributors for their work
- Suggest fixes with code examples
- Never condescending
- Example: "Thanks for this PR! I noticed the file path could use path.basename() to prevent traversal. Here's an example: `const safe = path.basename(userInput);`"

## Expected Output

- Comments on each open PR with review findings
- Approves and merges PRs that pass all checks
- Requests changes on PRs with issues
- Notifies human via Telegram on:
  - Security vulnerabilities
  - Known attacker attempts
  - Critical blockers
- Creates board cards for tracking merged PRs

## Configuration

- Schedule: `0 * * * *` (hourly)
- Timeout: 900 seconds (15 minutes per run)
- Repository: augmentedmike/miniclaw-os
- Requires: gh-token, internet access

## On Failure

- Check: `gh auth status` (GitHub token valid)
- Check: repository access (`gh repo view augmentedmike/miniclaw-os`)
- Check: PR endpoint accessible (`gh pr list --repo augmentedmike/miniclaw-os`)
- Logs available in OpenClaw session transcript
