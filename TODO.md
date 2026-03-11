# MiniClaw TODO

## Done This Session

### Documentation
- [x] Created FEATURES.md — all 18 plugins with summaries and example commands
- [x] Created WISHLIST.md — mc-comics planned plugin (wraps comic-cli)
- [x] Updated README — security alert, all plugins listed, features link, v0.1.0 badge
- [x] Created CONTRIBUTING.md — with "Contributing with MiniClaw" agent-driven guide
- [x] Wiki — 5 pages pushed (Home, Brain Regions, Agent Workflow, Writing Plugins, Cognitive Architecture Notes)
- [x] Added "Building plugins with MiniClaw" section to wiki Writing-Plugins page

### Security
- [x] Removed hardcoded secrets from cron/scripts/email-triage.py (gateway token, TG bot token, TG chat ID) — now reads from vault
- [x] Scrubbed personal data from plugins/mc-rolodex/tools/load-contacts.js
- [x] Expanded .gitignore (.env*, *.key, *.pem, credentials.json, etc.)
- [x] Created scripts/security-check.sh pre-commit hook (scans for API keys, tokens, PII, private keys)
- [x] Scrubbed entire git history with git-filter-repo (removed all leaked secrets)
- [x] Rotated Telegram bot token (new token stored in vault as tg-bot-token)
- [x] Rotated openclaw-gateway-token (new token in vault + openclaw.json)
- [x] Stored tg-chat-id in vault

### GitHub Repo
- [x] Created GitHub Release v0.1.0 with release notes
- [x] Updated repo description
- [x] Updated topics — removed `seo`, added `autonomous-agent`, `plugin-system`, `cognitive-architecture`
- [x] Created issue templates: Bug Report, Feature Request, Plugin Idea
- [x] Created PR template with security checklist
- [x] Deleted old v0.0.1 tag, created v0.1.0 tag

### New Plugin: mc-contribute
- [x] Scaffolded full plugin (openclaw.plugin.json, index.ts, tools, cli, config, guidelines)
- [x] 10 agent tools: scaffold_plugin, branch, security_check, pr, status, guidelines, bug_report, feature_request, discussion
- [x] Contribution guidelines baked into src/guidelines.ts
- [x] Context injection — agent always sees key rules
- [x] Added to FEATURES.md

### Installer (install.sh)
- [x] Added Step 0: detect existing vanilla OpenClaw install
- [x] Archives existing ~/.openclaw before installing (cp -a, never deletes)
- [x] Added Step 15: migrate data from archived install
  - Merges openclaw.json (model prefs, auth, gateway settings)
  - Imports user data (board cards, KB, personal state)
  - Imports workspace (SOUL.md, IDENTITY.md, etc.)
  - Imports memory files
  - Imports cron jobs
  - Imports upstream OpenClaw plugins (registers them in openclaw.json)
  - Skips plugins where MiniClaw has its own version

### Installer Fixes (bootstrap.sh)
- [x] Fix bootstrap.sh version: v0.0.1 → v0.1.1
- [x] Fix bootstrap.sh usage comment: v1.0.0 → v0.1.1
- [x] Fix MANIFEST.json version: 0.3.0 → 0.1.1
- [x] Fix bootstrap.sh destructive re-clone: replaced rm -rf with git fetch + checkout
- [x] Commit and push install.sh migration changes

### Version Alignment (v0.1.1)
- [x] bootstrap.sh default version → v0.1.1
- [x] MANIFEST.json → 0.1.1
- [x] README.md badge → v0.1.1
- [x] docs/install.md curl example + env var table → v0.1.1

### Upstream Research
- [x] Cloned upstream OpenClaw → projects/openclaw-upstream/
- [x] Found cron architecture: JSON store at `~/cron/jobs.json` (CronStoreFile format, version + jobs array)

## In Progress

### Cron Backup for Migration (install.sh)
- [ ] Read upstream cron store module (`src/cron/store.ts`) for exact path resolution
- [ ] Read cron types (`src/cron/types.ts`) for job schema
- [ ] Determine if OpenClaw also registers system crontab entries (or internal scheduler only)
- [ ] Add to install.sh Step 15: dump `crontab -l`, grep for openclaw entries, archive them
- [ ] Add to install.sh Step 15: find and copy `cron/jobs.json` from archived install
- [ ] Test migration with a mock openclaw cron store

### Plugin Registration
- [ ] Register missing plugins in MANIFEST.json: mc-blog, mc-contribute, mc-docs, mc-human, mc-memo, mc-seo, mc-voice

### mc-contribute Cleanup
- [ ] Remove placeholder TODOs in tools/definitions.ts (lines 128, 150)

## Backlog

### Plugin Documentation
- [ ] Add README.md to plugins missing one (mc-blog, mc-board, mc-context, mc-contribute, mc-designer, mc-email, mc-human, mc-jobs, mc-kb, mc-memo, mc-queue, mc-seo, mc-soul, mc-substack, mc-trust, mc-voice)

### Testing
- [ ] Set up Jest config and test infrastructure across plugins
- [ ] Add tests for untested plugins (11 with zero coverage)
- [ ] Investigate test-results/ failed status; add to .gitignore or CI

### Config Hygiene
- [ ] Replace hardcoded `~/` paths in MANIFEST.json with env var expansion
- [ ] Migrate backlog items to GitHub Issues for public visibility

### GitHub Issues to Create
- [ ] Non-destructive install/import for existing OpenClaw users
- [ ] Step-by-step wizard after install for setting up MC, Telegram, and Tailscale

### Future Work
- [ ] Post-install setup wizard (interactive: configure Telegram bot, Tailscale, choose model, etc.)
- [ ] Linux support improvements (installer currently Mac-only)
- [ ] Social preview image for GitHub repo (og:image)
- [ ] mc-comics plugin (wrap comic-cli as MiniClaw plugin — see WISHLIST.md)
- [ ] Multi-agent coordination (agents negotiate/delegate tasks)
- [ ] Resource governance (token budgets per task)
- [ ] Observability dashboard for agent behavior over time
- [ ] Plugin phase 2/3/4 roadmaps (mc-board web view, mc-designer transparency, mc-trust mesh, mc-context)
