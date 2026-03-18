-- mc-board seed data — default projects and starter cards
-- Run AFTER schema.sql. Safe to re-run (uses INSERT OR IGNORE).

INSERT OR IGNORE INTO projects (id, name, slug, description, status, created_at, updated_at)
VALUES
  ('prj_uncategorized', 'Uncategorized', 'uncategorized', 'Default project for unassigned cards', 'active', datetime('now'), datetime('now')),
  ('prj_miniclaw_enh', 'MiniClaw Enhancements', 'miniclaw-enhancements', 'Improvements and new features for MiniClaw', 'active', datetime('now'), datetime('now')),
  ('prj_setup', 'Setup finalization', 'setup-finalization', 'MiniClaw setup finalization and verification', 'active', datetime('now'), datetime('now'));

-- Starter cards (safe to re-run — uses INSERT OR IGNORE with fixed IDs)
INSERT OR IGNORE INTO cards (id, title, col, priority, tags, project_id, created_at, updated_at, problem_description, acceptance_criteria)
VALUES
  ('crd_seed_verify', 'Verify MiniClaw installation', 'backlog', 'high', '["setup","verification"]', 'prj_setup', datetime('now'), datetime('now'),
    'Run mc-smoke and verify all checks pass. If any fail, run mc-doctor --auto to fix them.',
    'mc-smoke reports 0 failures.'),
  ('crd_seed_onboarding', 'Onboarding: ask human their name and email', 'backlog', 'high', '["setup","onboarding"]', 'prj_setup', datetime('now'), datetime('now'),
    'The rolodex has a placeholder contact for the human owner (name="My Human", no email). The agent needs to ask the human for their real name and preferred email address, then update the rolodex so all future communications use the correct identity.',
    '- [ ] Human contact in rolodex has their real name (not "My Human")
- [ ] Human contact has their real email address
- [ ] Agent confirmed the update via mc-rolodex list');
