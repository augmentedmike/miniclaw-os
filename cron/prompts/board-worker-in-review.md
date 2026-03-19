Board worker — IN-REVIEW triage.

1. Get configured capacity limit: openclaw mc-board capacity-limit in-review → call this MAX
2. Count current in-review cards: openclaw mc-board context --column in-review
   Count ALL cards returned → call this IN_REVIEW_COUNT.
   If IN_REVIEW_COUNT ≥ MAX: Stop here. Silent exit. Do NOT send any Telegram message.
3. Check active workers: openclaw mc-board active
4. Get full column context (excludes on-hold): openclaw mc-board context --column in-review --skip-hold
5. Select up to [MAX - IN_REVIEW_COUNT] cards to work: highest priority then oldest, across all projects. Skip cards already in the active list.
   If 0 cards available: Stop here. Silent exit. Do NOT send any Telegram message.
6. For each selected card:
   a. Register pickup: openclaw mc-board pickup <id> --worker board-worker-in-review
   b. Read full detail: openclaw mc-board show <id>
   c. Audit: verify the work product exists and all criteria are genuinely met
   d. If it holds up:
      - openclaw mc-board update <id> --review "Audited [date]: [what was checked, findings]"
      - openclaw mc-board move <id> shipped
      - IMMEDIATELY create a VERIFY card in backlog using brain_create_card:
          title: "VERIFY: [original card title]"
          project_id: [same as shipped card]
          priority: high
          column: backlog
          problem: "Confirm [shipped card title] ([shipped card id]) is live and working in production."
          plan: "1. PRODUCTION CHECK: verify the shipped work is actually live and functional (hit the URL, run the CLI, check the page, confirm the deploy).
2. DOCUMENT SWEEP: scan card notes and any /tmp or workspace paths mentioned — find files/docs created during the work. For each: if a knowledge doc (md, txt, research) move to ~/.openclaw/workspace/docs/ or relevant subdir then kb_add it; if an artifact (image, PDF, video) move to ~/.openclaw/workspace/artifacts/ and note path in KB; if already in workspace just kb_add if not yet indexed.
3. END-TO-END TEST: exercise the main use case — not just that it exists but that it works.
4. PASS: move this card to shipped. FAIL: create a bug card linked to original, move this card to backlog."
          criteria: "- [ ] Production verified live
- [ ] Documents/artifacts moved to workspace (if any)
- [ ] Documents indexed in KB (if any)
- [ ] End-to-end test passed"
   e. If it fails:
      - Uncheck failed criteria and add a note explaining what is wrong
      - openclaw mc-board update <id> --notes "Review failed: <reason>"
      - Leave in in-review for another pass
   f. Release: openclaw mc-board release <id> --worker board-worker-in-review
7. Done. Silent exit.
