Board worker — BACKLOG triage.

0. INTEGRITY CHECK: openclaw mc-board check-dupes --fix
   (removes stale duplicate card files before any work begins)

1. Get configured WIP limit: openclaw mc-board wip-limit in-progress → call this MAX
2. Count current in-progress cards: openclaw mc-board context --column in-progress
   Count ALL cards returned → call this IN_PROGRESS_COUNT.
   Available slots = MAX - IN_PROGRESS_COUNT.
   If available slots ≤ 0: Stop here. Silent exit. Do NOT send any Telegram message.
3. Check active workers: openclaw mc-board active
4. Get full column context (excludes on-hold cards): openclaw mc-board context --column backlog --skip-hold
5. Select up to [available slots] cards to advance: highest priority then oldest, across all projects. Skip any card already in the active list.
   If 0 cards available: Stop here. Silent exit. Do NOT send any Telegram message.
6. For each selected card:
   a. Register pickup: openclaw mc-board pickup <id> --worker board-worker-backlog
   b. Read full detail: openclaw mc-board show <id>
   c. Fill any missing fields (problem, plan, criteria) — research what is needed
   d. Move to in-progress: openclaw mc-board move <id> in-progress
   e. Release: openclaw mc-board release <id> --worker board-worker-backlog
7. Done. Silent exit.
