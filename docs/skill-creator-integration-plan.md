# Skill Creator Integration Plan

**System:** AugmentedMike / OpenClaw on Mac mini (AugmentedMikes-Mac-mini, 192.168.1.136)
**Date:** 2026-03-05
**Scope:** How to wire Anthropic's `skill-creator` skill into the miniclaw-os / mc-board pipeline so OpenClaw can autonomously produce and maintain Claude Code skills.

---

## 1. What `skill-creator` Does

Source: `https://github.com/anthropics/skills/tree/main/skills/skill-creator`

`skill-creator` is a Claude skill (a SKILL.md file that Claude Code loads at context time) that teaches Claude how to build *other* skills from scratch. It wraps a complete, repeatable workflow:

**Core loop: Draft → Test → Evaluate → Improve → Optimize → Package**

1. **Capture intent** — Interview the user (or agent) about what the skill should do: when it triggers, what its output format is, whether test cases are needed.
2. **Write SKILL.md** — Produce the YAML frontmatter (`name`, `description`) and a markdown body following a strict anatomy: `scripts/` for reusable code, `references/` for loaded docs, `assets/` for output templates.
3. **Run evaluations** — Spawn two parallel subagents per test case: one *with* the new skill, one *without* (baseline). Results go into an `<skill-name>-workspace/iteration-N/` directory tree.
4. **Grade and benchmark** — A grader subagent checks assertions; `scripts/aggregate_benchmark.py` computes pass rates, token costs, and timing deltas between with-skill and baseline runs.
5. **Review loop** — `eval-viewer/generate_review.py` opens an HTML viewer (or writes a static file in headless environments) so a human or supervisory agent can leave feedback per test case.
6. **Improve** — Rewrite the skill based on feedback, re-run into `iteration-N+1/`, repeat until quality is acceptable.
7. **Optimize description** — Run `scripts/run_loop.py` to auto-tune the SKILL.md `description` field (the primary trigger mechanism). It uses a 60/40 train/test eval split and up to 5 iterations of extended-thinking refinement.
8. **Package** — `scripts/package_skill.py` produces a `.skill` bundle file for distribution.

**Supporting agents** (in `skills/skill-creator/agents/`):
- `grader.md` — evaluates assertions against run outputs
- `comparator.md` — blind A/B comparison between two skill versions
- `analyzer.md` — surfaces non-discriminating assertions, high-variance evals, time/token tradeoffs

**Key constraint:** Description optimization (`run_loop.py`) requires the `claude -p` CLI. This is available on the Mac mini via Claude Code CLI. The eval viewer requires either a display (for `webbrowser.open`) or `--static <path>` flag for headless use.

---

## 2. How AugmentedMike / OpenClaw Can Use It Autonomously

### 2.1 Where Skills Live

Claude Code skills are loaded from a `skills/` directory that Claude Code resolves relative to the project root or a configured path. The standard location Claude Code checks is:

```
~/.claude/skills/<skill-name>/SKILL.md
```

This directory does not yet exist on the Mac mini. It needs to be created.

Skills in the miniclaw-os repo should be version-controlled at:

```
/Users/augmentedmike/am/projects/miniclaw-os/skills/<skill-name>/SKILL.md
```

At install time (or via `bootstrap.sh`), skills are symlinked or copied into `~/.claude/skills/`. A new `mc-skills` plugin (described in Section 3) manages this lifecycle.

### 2.2 How a Board Card Can Trigger Skill Creation

The mc-board pipeline already has a `process` step that spawns a `claude -p` subprocess against a card. The same mechanism can drive skill creation.

A card that requests a new skill would carry a special tag — `skill` — and a structured problem description:

```
Title: Skill: git-commit-formatter
Tags: skill, automation
Problem: Every time OpenClaw makes commits it reinvents formatting rules.
         We need a skill that enforces Conventional Commits with auto-scope detection.
Plan: skill-creator workflow — draft, 3 test cases, eval loop, optimize description, commit.
Acceptance criteria:
- [ ] SKILL.md exists at ~/.claude/skills/git-commit-formatter/
- [ ] Pass rate >= 80% on eval set
- [ ] Description triggering score >= 0.75 on held-out set
- [ ] Committed to miniclaw-os repo under skills/git-commit-formatter/
```

The `board-worker-in-progress` cron (runs every 5 minutes) picks up the card. It detects the `skill` tag and routes to a skill-creation prompt instead of the standard work prompt. This routing happens inside the in-progress worker's system prompt.

### 2.3 How the mc-board Process / Work Workflow Includes "Create Skill"

The existing `/api/process/[column]/[cardId]` route spawns Claude with a prompt loaded from `~/am/user/augmentedmike_bot/brain/prompts/in-progress-process.txt`.

**Minimal change:** Add a conditional block to that prompt file:

```
If the card has tag "skill":
  1. Load the skill-creator skill: --skill ~/.claude/skills/skill-creator/
  2. The card's problem_description contains the skill spec.
  3. Run the full skill-creator workflow (draft → 3 evals → benchmark → improve once → optimize description).
  4. Save the skill to ~/am/skills-workspace/<skill-name>/.
  5. Output the APPLY block with:
     - research: summary of what was built and eval scores
     - notes: path to the new skill directory
     - work_log: worker=skill-creator, note=<one line summary>
```

The subprocess that handles `skill` cards needs:
- The `skill-creator` skill available at `~/.claude/skills/skill-creator/`
- The `claude` CLI accessible (already the case via `CLAUDE_BIN`)
- The `--skill` flag passed when spawning the subprocess (Claude Code CLI supports `--skill <path>`)
- Python 3 available for `aggregate_benchmark.py` and `generate_review.py` (use `uvx` or the system Python)
- Write access to `~/am/skills-workspace/` for eval runs

**Route-level change:** In `/api/process/[column]/[cardId]/route.ts`, add a branch: if `card.tags.includes("skill")`, use a different prompt path and add `--skill ~/.claude/skills/skill-creator/` to the `spawn` args array.

The `WorkModal` and `ProcessModal` components need no changes — they stream output just as they do today.

### 2.4 How Created Skills Are Committed Back to miniclaw-os

After a skill passes its eval gate (defined in the card's acceptance criteria), the in-progress worker:

1. Copies `~/am/skills-workspace/<skill-name>/` to `/Users/augmentedmike/am/projects/miniclaw-os/skills/<skill-name>/`
2. Symlinks (or copies) it into `~/.claude/skills/<skill-name>/`
3. Runs:
   ```bash
   cd /Users/augmentedmike/am/projects/miniclaw-os
   git add skills/<skill-name>/
   git commit -m "feat(skills): add <skill-name> skill (auto-created by OpenClaw)"
   ```
4. Appends a `brain_update_card` call that moves the card to `in-review` with the commit SHA in `notes`.

The `in-review` worker then verifies the skill is importable (`claude --skill ~/.claude/skills/<skill-name>/ -p "test"` exits 0) and ships the card.

For git push to the public repo, the `gh` CLI is already authenticated as `augmentedmike`. The worker can optionally push after commit using the `gh-token` from the vault.

---

## 3. Implementation Steps

### Step 1: Install skill-creator locally (1 hour)
- Clone or curl the skill-creator directory from `https://github.com/anthropics/skills` into `~/.claude/skills/skill-creator/`
- Verify Python scripts run: `python -m scripts.aggregate_benchmark --help`
- Add `skills/skill-creator/` to the miniclaw-os repo as a git submodule or vendored copy

**Files to create/touch:**
- `~/.claude/skills/skill-creator/` (downloaded)
- `/Users/augmentedmike/am/projects/miniclaw-os/skills/skill-creator/` (tracked copy)

### Step 2: Create the skills directory structure (30 min)
- Add `skills/` at the miniclaw-os repo root
- Update `bootstrap.sh` to symlink `skills/` entries into `~/.claude/skills/`
- Update `MANIFEST.json` to add a `"skills"` key listing managed skills

**Files to edit:**
- `/Users/augmentedmike/am/projects/miniclaw-os/bootstrap.sh`
- `/Users/augmentedmike/am/projects/miniclaw-os/MANIFEST.json`

### Step 3: Add skill-routing to the in-progress process prompt (2 hours)
- Edit `~/am/user/augmentedmike_bot/brain/prompts/in-progress-process.txt` to detect the `skill` tag
- Add the skill-creation workflow instructions (what to do, where to save outputs, what APPLY fields to return)
- Test manually by creating a card with `tag: skill` and running Process on it via the UI

**Files to edit:**
- `~/am/user/augmentedmike_bot/brain/prompts/in-progress-process.txt`

### Step 4: Update the process route to pass `--skill` flag (2 hours)
- In `/api/process/[column]/[cardId]/route.ts`, detect `skill` tag on the card
- Add `--skill`, `~/.claude/skills/skill-creator/` to the `spawn` args when the tag is present
- Test with a dry run card

**Files to edit:**
- `/Users/augmentedmike/am/projects/miniclaw-os/plugins/mc-board/web/src/app/api/process/[column]/[cardId]/route.ts`

### Step 5: Add git-commit step to the worker output handler (2 hours)
- After a `skill`-tagged card's APPLY block is parsed and applied, run the git add/commit sequence
- The commit runs in the miniclaw-os repo directory
- Move card to `in-review` automatically if commit succeeds

**Files to edit:**
- Same route.ts as Step 4 (extend the `proc.on("close")` handler)

### Step 6: Add `mc-skills` plugin (optional, 4 hours)
- New plugin at `plugins/mc-skills/` that manages the `~/.claude/skills/` directory
- CLI commands: `mc-skills list`, `mc-skills install <name>`, `mc-skills remove <name>`, `mc-skills sync`
- `sync` copies all `skills/` entries from the repo into `~/.claude/skills/`
- Called by `bootstrap.sh` on setup and by the board worker after committing a new skill

**Files to create:**
- `/Users/augmentedmike/am/projects/miniclaw-os/plugins/mc-skills/index.ts`
- `/Users/augmentedmike/am/projects/miniclaw-os/plugins/mc-skills/cli.ts`

### Step 7: Add `brain_create_skill_card` helper (optional, 1 hour)
- Convenience tool definition in `tools/definitions.ts` that creates a pre-formatted skill card with the right tags, problem template, and acceptance criteria checklist
- Makes it easy for OpenClaw to request a skill from any agent session

**Files to edit:**
- `/Users/augmentedmike/am/projects/miniclaw-os/plugins/mc-board/tools/definitions.ts`

### Step 8: End-to-end test (2 hours)
- Create a card: "Skill: inbox-summarizer" tagged `skill`
- Watch it flow through backlog → in-progress (skill creation runs) → in-review (verify) → shipped
- Confirm `~/.claude/skills/inbox-summarizer/SKILL.md` exists and is loadable
- Confirm commit appears in miniclaw-os git log

---

## 4. Risks and Constraints

### Skill naming
- Skill names must be valid directory names (lowercase, hyphens, no spaces)
- The SKILL.md `name` field in frontmatter must match the directory name exactly — Claude Code uses the directory name when loading, but the `name` field for display
- Collisions with future Anthropic first-party skills are possible; prefix OpenClaw-created skills with `am-` (e.g., `am-inbox-summarizer`) to namespace them

### Claude Code version requirements
- The `--skill <path>` flag was introduced in Claude Code; confirm it is supported by the installed version
  - Check: `claude --version` and `claude --help | grep skill`
- The `skill-creator` scripts require Python 3 with standard library only (no pip installs needed for the core scripts)
- `run_loop.py` (description optimizer) calls `claude -p` as a subprocess — this requires Claude Code CLI to be on `PATH` in the environment where the script runs. The `process` route already strips `CLAUDECODE` from env to avoid nested session conflicts; verify `claude` binary is still on `PATH` after that strip

### Headless eval viewer
- The Mac mini runs the board web server headlessly (LaunchAgent, no display session)
- `generate_review.py` must always be called with `--static <output_path>` in this environment
- Static HTML output goes to `~/am/skills-workspace/<skill-name>/eval-review.html`
- Michael can open it via the board UI or directly in a browser; the board can serve it as a static asset

### Context window during skill creation
- Skill creation with 3 eval pairs (6 subagent runs) and iteration can consume significant tokens
- The `in-progress` worker cron runs every 5 minutes with a 600-second timeout — skill creation will exceed this for complex skills
- Mitigation: skill cards should be tagged `on-hold` while the long-running skill-creation subprocess is active, preventing the next cron iteration from picking them up again (the existing `skip_hold` flag in `brain_column_context` already supports this pattern)

### Git conflicts
- The board worker commits directly to the working tree of `miniclaw-os`
- If Michael or another process has uncommitted changes, the commit will fail
- The worker should check `git status --short` before committing and bail with an error note on the card if the tree is dirty

### Eval quality
- Automated eval grading using `grader.md` requires subagent spawning, which uses additional Claude API quota
- For the autonomous (cron-driven) path, run only 2 test cases per skill and skip the blind comparator to keep costs bounded
- The description optimizer (`run_loop.py`) should be reserved for manually-requested skill polishing, not the autonomous creation path — it is expensive (up to 5 iterations × multiple eval runs × extended thinking)

### Skill triggering threshold
- Claude Code only triggers a skill when the query is sufficiently complex; simple one-step prompts may not trigger even with a perfect description
- Autonomous skill creation needs to design test cases that are realistic multi-step tasks, not trivial commands
- The in-progress worker prompt for skill cards should explicitly instruct this

---

## Quick Reference: Key Paths

| Item | Path |
|------|------|
| Claude Code skills directory | `~/.claude/skills/` |
| miniclaw-os skills (version-controlled) | `/Users/augmentedmike/am/projects/miniclaw-os/skills/` |
| skill-creator skill | `~/.claude/skills/skill-creator/SKILL.md` |
| Skill eval workspace | `~/am/skills-workspace/<skill-name>/` |
| in-progress process prompt | `~/am/user/augmentedmike_bot/brain/prompts/in-progress-process.txt` |
| Process route (to add --skill flag) | `/Users/augmentedmike/am/projects/miniclaw-os/plugins/mc-board/web/src/app/api/process/[column]/[cardId]/route.ts` |
| Board tool definitions | `/Users/augmentedmike/am/projects/miniclaw-os/plugins/mc-board/tools/definitions.ts` |
| miniclaw-os manifest | `/Users/augmentedmike/am/projects/miniclaw-os/MANIFEST.json` |

---

## Suggested First Card

To bootstrap the system, create this card manually:

```
Title: Skill: am-board-worker
Tags: skill, miniclaw, focus
Priority: high
Problem: OpenClaw's board workers repeatedly reinvent the same patterns for picking up
         cards, doing work, and releasing them. A skill would encode the canonical
         workflow so every board-worker cron session loads it automatically.
Plan: Use skill-creator to draft a skill that documents the exact board worker
      loop: column_context → pickup → work → update → release → move.
      2 test cases, 1 eval iteration, optimize description, commit to repo.
Acceptance criteria:
- [ ] SKILL.md exists at ~/.claude/skills/am-board-worker/
- [ ] Skill loads without error in a test claude -p session
- [ ] Committed to miniclaw-os under skills/am-board-worker/
```

This is a good first skill to create autonomously because (a) it has objectively verifiable outputs, (b) its behavior is well-understood, and (c) success immediately improves the board worker loop itself.
