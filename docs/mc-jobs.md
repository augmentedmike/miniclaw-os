# mc-jobs — Role Templates, Workflows, and Review Gates

mc-jobs is the OpenClaw plugin for defining **role-specific job templates**. A job gives an agent a persistent identity for a category of work: who they are (git config), where they work (workspace paths), what tools they need, and what they must verify before they finish (review gate).

Jobs are **not** scheduled tasks. They are templates that describe a role. Scheduled execution is handled separately by the openclaw cron system.

---

## Jobs vs Cron

| Concept | mc-jobs | openclaw cron |
|---|---|---|
| **Purpose** | Role identity and workflow definition | Scheduled task execution |
| **What it defines** | Git config, workspace paths, tools, review gate | Schedule (cron expr or interval), prompt/message, agent session |
| **When it fires** | On demand — loaded when needed | Automatically on a timer |
| **Stored as** | `~/.miniclaw/jobs/<id>.json` | `~/am/cron/jobs.json` |
| **CLI** | `openclaw mc jobs list/get/init` | `openclaw mc cron ...` |

A cron task may reference a job's identity (e.g., use the same git config), but the two systems are independent. A job template does not schedule itself.

---

## Architecture

```
openclaw mc jobs <command>          ← CLI entry point
       │
       ├── cli/commands.ts          ← registerJobsCommands() — list, get, init
       │
       └── src/jobs.ts              ← Job interface, JobsStore, createSoftwareDeveloperJob()
```

**Storage:** One JSON file per job, stored in `~/.miniclaw/jobs/`. Created automatically on first plugin load if the directory is empty.

---

## Job Template Format

Jobs are stored as JSON files at `~/.miniclaw/jobs/<id>.json`. Every field is required unless noted.

```json
{
  "id": "software-developer",
  "name": "Software Developer",
  "description": "Full-stack software developer with git workflows, token management, and review gates.",
  "missionStatement": "Build real, shipped software. Verify locally. Commit with clarity. Push when done.",

  "git": {
    "userName": "AugmentedMike",
    "userEmail": "augmentedmike@gmail.com",
    "vaultTokenName": "gh-am-mini"
  },

  "workspace": {
    "openclaw": "~/.openclaw",
    "home": "~/am",
    "projects": "~/am/projects"
  },

  "tools": [
    { "name": "git",      "required": true,  "description": "Version control — commit, push, pull" },
    { "name": "vault",    "required": true,  "description": "Secret management — token retrieval" },
    { "name": "npm/pnpm", "required": true,  "description": "Package manager — install, build, test" },
    { "name": "github",   "required": false, "description": "GitHub CLI for PR creation and issue tracking" }
  ],

  "reviewGate": {
    "description": "Before pushing, verify that all work is complete, tested locally, and committed with clear messages.",
    "steps": [
      "1. Code runs locally without errors",
      "2. All tests pass (if applicable)",
      "3. git status shows clean working directory",
      "4. Commit message is clear and references card ID if applicable",
      "5. Ready to git push to main branch"
    ]
  }
}
```

### Field Reference

| Field | Type | Description |
|---|---|---|
| `id` | `string` | Unique identifier. Used as the filename (`<id>.json`) and as the key for `jobs get`. |
| `name` | `string` | Human-readable role name. |
| `description` | `string` | Short summary of the role's scope. |
| `missionStatement` | `string` | The agent's guiding principle for this role. Loaded into session context. |
| `git.userName` | `string` | Git author name for commits made under this role. |
| `git.userEmail` | `string` | Git author email. |
| `git.vaultTokenName` | `string` | Name of the token in the `vault` secret store used for git push auth (e.g., `gh-am-mini`). |
| `workspace.openclaw` | `string` | Path to the openclaw home dir (e.g., `~/.openclaw` or `~/am`). |
| `workspace.home` | `string` | Agent's home working directory. |
| `workspace.projects` | `string` | Root directory for git repos. |
| `tools` | `array` | List of tools the agent needs. `required: true` means the task cannot proceed without it. |
| `reviewGate` | `object` | Checklist the agent must pass before pushing/finishing. See below. |

---

## Role-Based vs Ad-Hoc Jobs

**Role-based jobs** are named, persisted templates (`~/.miniclaw/jobs/<id>.json`). They are loaded by the plugin at startup and referenced by name. They define a stable identity that can be reused across many tasks or cron runs.

**Ad-hoc work** is any agent task run without a job template — no defined git config, no explicit review gate, no declared toolset. Ad-hoc is fine for one-off queries or simple tasks that don't involve commits or deployments.

Use a job template when:
- The agent will be committing and pushing code
- You want a consistent git identity across sessions
- You need a pre-push review checklist enforced by convention
- The role will be reused (same config every time, just different task content)

---

## Review Gate

The `reviewGate` is an ordered checklist defined inside the job template. It is not enforced by the system automatically — it is a convention the agent is expected to follow before marking work as done.

```json
"reviewGate": {
  "description": "Before pushing, verify that all work is complete, tested locally, and committed with clear messages.",
  "steps": [
    "1. Code runs locally without errors",
    "2. All tests pass (if applicable)",
    "3. git status shows clean working directory",
    "4. Commit message is clear and references card ID if applicable",
    "5. Ready to git push to main branch"
  ]
}
```

When an agent loads a job via `jobs get`, the review gate steps are printed as part of the job detail. The agent reads them and self-enforces. This differs from mc-board's gate system (which is code-enforced) — the review gate is a human-readable checklist meant to keep the agent accountable at the end of a session.

**Customizing the gate:** Edit the job's JSON file directly at `~/.miniclaw/jobs/<id>.json`. Add, remove, or reword steps to match the role's actual risk surface. For example, a deploy role might add a step to verify the deployment URL is live before reporting done.

---

## CLI Reference

All commands use `openclaw mc jobs <subcommand>`.

### `jobs list`

List all job templates in the jobs directory.

```
openclaw mc jobs list
```

Output:
```
Available jobs:
  software-developer — Software Developer
    Full-stack software developer with git workflows, token management, and review gates.
```

If no jobs exist: `No jobs found. Run 'mc jobs init' to bootstrap.`

---

### `jobs get <jobId>`

Show full details of a job template.

```
openclaw mc jobs get <jobId>

Example:
  openclaw mc jobs get software-developer
```

Output includes: name, description, mission statement, git config, workspace paths, required tools (with `[REQUIRED]` / `[optional]` markers), and the full review gate checklist.

---

### `jobs init`

Scaffold the default job templates into `~/.miniclaw/jobs/`.

```
openclaw mc jobs init
```

Currently bootstraps one template: `software-developer`. Safe to re-run — if the template already exists it will be overwritten with the default.

The plugin also auto-runs this on startup: if `~/.miniclaw/jobs/software-developer.json` does not exist when mc-jobs loads, it is created automatically.

---

## Plugin Configuration

In `openclaw.config.json` (or equivalent), mc-jobs accepts:

```json
{
  "plugins": {
    "mc-jobs": {
      "jobsDir": "/custom/path/to/jobs",
      "defaultJob": "software-developer"
    }
  }
}
```

| Option | Default | Description |
|---|---|---|
| `jobsDir` | `~/.miniclaw/jobs` | Directory where job JSON files are stored. |
| `defaultJob` | `software-developer` | Job to activate by default (reserved for future use — not yet applied automatically). |

---

## Adding a Custom Job

1. Create a JSON file at `~/.miniclaw/jobs/<your-id>.json` following the template format above.
2. Set a unique `id` matching the filename (without `.json`).
3. Define the git config, workspace paths, tools list, and review gate appropriate for the role.
4. Verify it appears: `openclaw mc jobs list`
5. Inspect it: `openclaw mc jobs get <your-id>`

There is no `jobs add` command — jobs are managed as plain JSON files. This makes them easy to version-control alongside other workspace config.

---

## Storage Location

```
~/.miniclaw/jobs/
  software-developer.json    ← default, auto-created on plugin load
  <custom-id>.json           ← any additional roles
```

The directory is created automatically by the plugin if it does not exist. The path can be overridden via `jobsDir` in plugin config.
