# mc-board — PLAN

**Brain analog**: Prefrontal cortex — planning, executive function, task management
**Role**: State-machine kanban board. Tracks work from backlog through shipped with enforced state gates.

---

## Phases

### Phase 1 — Core + CLI + Context hook ✅ (built)

- Card store (JSON-backed, per-card files)
- State machine with enforced gate checks per transition
- CLI: `brain create / list / show / update / move / board / next / archive`
- `before_prompt_build` hook — injects compact board summary into agent context
- Agent tools: `board_create_card`, `board_move_card`, `board_list_cards`, etc.
- Archive support — move shipped cards out of active board

### Phase 2 — Agent tools ✅ (built)

- Full tool definitions for autonomous agent use
- Agent can create, move, and query cards without CLI

### Phase 3 — Web debug view

- Standalone web UI on port 4220 (LaunchAgent: `com.augmentedmike.mc-board-web`)
- Read-only board visualization for quick human review
- Filter by column, priority, tag

### Phase 4 — QMD integration

- Sync card context into QMD collection for semantic search
- `before_prompt_build` pulls relevant cards via QMD rather than full board dump
- Reduces prompt overhead for large boards

### Future

- Multi-board support (projects)
- Due dates and time estimates
- Dependency graph between cards (blocks/blocked-by)
- Slack/Telegram notifications on state transitions
