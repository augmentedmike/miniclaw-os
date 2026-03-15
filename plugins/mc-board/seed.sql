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
  ('crd_seed_meet_human', 'Get to know my human', 'backlog', 'high', '["onboarding","human"]', 'prj_setup', datetime('now'), datetime('now'),
    'Collect basic information from your human: their name, email address, phone number, what they do, and what they would like help with. Save the contact to the rolodex using openclaw mc-rolodex add with all fields populated. Also save to workspace memory for personalization.',
    'Human contact saved to rolodex (openclaw mc-rolodex search returns their entry with name, email, phone). Workspace memory updated with human preferences.');
