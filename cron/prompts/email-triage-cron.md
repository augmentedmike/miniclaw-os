# Email Triage Cron Prompt

Run AM's autonomous email triage on the live Gmail inbox.

Execute:
  mc mc-email triage --limit 30

This will:
- Connect to the configured email account via IMAP using the email-app-password from vault
- Fetch up to 30 unread messages
- Classify each via Claude Haiku (categories: press, support, spam, security-threat, emergency, routine)
- Execute the appropriate action per category:
  - press/support → reply in AM's voice, then archive
  - spam/routine  → archive only
  - security-threat → log to mc-kb, archive, NO reply
  - emergency → escalate to owner@example.com via send-alert, archive

When done, report back with:
- Total messages processed
- Count per category
- Any errors

If the script fails with an auth error: silent exit (HEARTBEAT_OK, will retry next cycle).
If the script fails for any other reason: report the error.
