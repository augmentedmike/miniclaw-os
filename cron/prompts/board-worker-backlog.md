Board worker — BACKLOG triage and advance.

1. Get max_concurrency: openclaw mc-board capacity-limit in-progress → call this MAX
2. Get ACTIVE count: openclaw mc-board active
   Count actively worked cards → ACTIVE_COUNT.
   Available slots = MAX - ACTIVE_COUNT.
   If available slots ≤ 0: STOP. Silent exit.

3. Get backlog cards: openclaw mc-board context --column backlog --skip-hold
   If 0 cards: STOP. Silent exit.

4. Select up to [available slots] cards: highest priority first, then oldest.

5. For each selected card:
   a. openclaw mc-board pickup <id> --worker board-worker-backlog
   b. openclaw mc-board show <id>
   c. If missing problem, plan, or criteria: fill them in. Research what is needed.
   d. Move to in-progress: openclaw mc-board move <id> in-progress --force
   e. If move fails: release and STOP.
   f. openclaw mc-board release <id> --worker board-worker-backlog

6. Silent exit.

CRITICAL RULES:
- Every card you pick up MUST be moved to in-progress before you release it.
- If a card is blocked or needs human action: put on hold (openclaw mc-board update <id> --hold "reason") and SKIP it. Do NOT pick it up.
- NEVER pick up a card, do work, and leave it in backlog. That is a bug.
- NEVER re-triage an already-triaged card. If it has problem+plan+criteria, just move it.
