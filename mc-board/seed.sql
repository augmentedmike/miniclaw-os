-- mc-board seed data — default projects and starter cards
-- Run AFTER schema.sql. Safe to re-run (uses INSERT OR IGNORE).

INSERT OR IGNORE INTO projects (id, name, slug, description, status, created_at, updated_at)
VALUES
  ('prj_uncategorized', 'Uncategorized', 'uncategorized', 'Default project for unassigned cards', 'active', datetime('now'), datetime('now')),
  ('prj_miniclaw_enh', 'MiniClaw Enhancements', 'miniclaw-enhancements', 'Improvements and new features for MiniClaw', 'active', datetime('now'), datetime('now')),
  ('prj_setup', 'Setup finalization', 'setup-finalization', 'MiniClaw setup finalization and verification', 'active', datetime('now'), datetime('now'));

-- Starter cards (safe to re-run — uses INSERT OR IGNORE with fixed IDs)
INSERT OR IGNORE INTO cards (id, title, col, priority, tags, project_id, created_at, updated_at, problem_description, implementation_plan, acceptance_criteria)
VALUES
  ('crd_seed_verify', 'Verify MiniClaw installation', 'backlog', 'high', '["setup","verification"]', 'prj_setup', datetime('now'), datetime('now'),
    'Run mc-smoke and verify all checks pass. If any fail, run mc-doctor --auto to fix them.',
    NULL,
    'mc-smoke reports 0 failures.'),
  ('crd_seed_onboarding', 'Onboarding: ask human their name and email', 'backlog', 'high', '["setup","onboarding"]', 'prj_setup', datetime('now'), datetime('now'),
    'The rolodex has a placeholder contact for the human owner (name="My Human", no email). The agent needs to ask the human for their real name and preferred email address, then update the rolodex so all future communications use the correct identity. IMPORTANT: Before asking, run openclaw mc-rolodex list --tag owner. If the owner contact already has a real name (not "My Human") and an email address, skip asking and move this card directly to done.',
    '0. GUARD: Run openclaw mc-rolodex list --tag owner. If the owner name is NOT "My Human" AND has a non-empty email, onboarding is already complete — move this card to done and exit immediately.
1. Send the human a Telegram message (use the inbox CLI, NOT mc-human) asking for their preferred name and email address.
2. Once the human replies in Telegram, find the human contact id with: openclaw mc-rolodex list --tag owner
3. Update the contact: openclaw mc-rolodex update <human-contact-id> --name "<real name>" --email "<real email>"
4. Verify the rolodex contact was updated correctly with: openclaw mc-rolodex list',
    '- [ ] Human contact in rolodex has their real name (not "My Human")
- [ ] Human contact has their real email address
- [ ] Agent confirmed the update via mc-rolodex list');
