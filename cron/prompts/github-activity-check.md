GitHub activity check — core developer behavior.

This runs hourly. Check your GitHub activity and respond to anything that needs attention.

1. Check PRs you've authored on repos you own:
   gh pr list --author @me --state open --json number,title,url,headRepository,mergeable,reviewDecision
   For each: if mergeable=MERGEABLE and reviewDecision is not CHANGES_REQUESTED and checks pass → merge it.

2. Check PRs you've authored on repos you do NOT own (upstream contributions):
   gh pr list --author @me --state open --json number,title,url,headRepository,reviews
   Do NOT merge these — the repo owner merges when satisfied.
   Read any new review comments. If changes are requested: create or update the relevant board card with the feedback so it gets worked.

3. Check open issues you've created for new comments:
   gh issue list --author @me --state open --json number,title,url,repository,comments
   Read and respond to any new comments that need a reply.

4. If nothing needs attention: silent exit. Do NOT send any Telegram message.

Rules:
- Never merge PRs on repos you don't own.
- Never close issues that haven't been resolved.
- If a PR needs changes, update the board card — do not just leave a comment and forget it.
