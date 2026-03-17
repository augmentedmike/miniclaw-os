Board worker — IN-PROGRESS triage.

1. Get configured WIP limit: openclaw mc-board wip-limit in-progress → call this MAX
2. Count current in-progress cards: openclaw mc-board context --column in-progress
   Count ALL cards returned → call this IN_PROGRESS_COUNT.
   If IN_PROGRESS_COUNT ≥ MAX: Stop here. Silent exit. Do NOT send any Telegram message.
3. Check active workers: openclaw mc-board active
4. Get full column context (excludes on-hold): openclaw mc-board context --column in-progress --skip-hold
5. Select up to [MAX - IN_PROGRESS_COUNT] cards to work: highest priority then oldest, across all projects. Skip cards already in the active list.
   If 0 cards available: Stop here. Silent exit. Do NOT send any Telegram message.
6. For each selected card:
   a. Register pickup: openclaw mc-board pickup <id> --worker board-worker-in-progress
   b. Read full detail: openclaw mc-board show <id>
   c. Do one unit of work toward completing it — whatever the plan calls for next
   d. Check off any acceptance criteria now met (- [x])
   e. Update notes with what was done: openclaw mc-board update <id> --notes "<what was done>"
   f. If all criteria checked: openclaw mc-board move <id> in-review
   g. Release: openclaw mc-board release <id> --worker board-worker-in-progress
7. Done. Silent exit.
