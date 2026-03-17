Board worker — BACKLOG triage and advance.

1. Get active workers: openclaw mc-board active
   Count actively worked cards → ACTIVE_COUNT.
2. Get backlog cards: openclaw mc-board context --column backlog --skip-hold
   If 0 cards: STOP. Silent exit.

3. Select cards to advance: highest priority first, then oldest. At most 1 per project.
   Skip any card already in the active list.
   If 0 candidates: STOP. Silent exit.

4. For each selected card:
   a. openclaw mc-board pickup <id> --worker board-worker-backlog
   b. openclaw mc-board show <id>
   c. If missing problem, plan, or criteria: fill them. Research what is needed.
   d. Move to in-progress: openclaw mc-board move <id> in-progress --force
   e. If move fails: put card on hold with reason, release, and STOP.
   f. openclaw mc-board release <id> --worker board-worker-backlog

5. Silent exit.

CRITICAL RULES:
- Every card you pick up MUST be moved to in-progress before release.
- If a card is blocked or needs human action: put on hold and SKIP it.
- NEVER pick up a card, do work, and leave it in backlog.
- NEVER re-triage a card that already has problem+plan+criteria. Just move it.
