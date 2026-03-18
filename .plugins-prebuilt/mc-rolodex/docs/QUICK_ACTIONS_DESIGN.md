# Quick-Actions UI Design

## Overview

Quick-actions are contextual shortcuts available when viewing a contact in the TUI browser. They allow agents to take immediate action on verified contacts without leaving the browser.

## Design Spec

### Contact Details Modal

When viewing a contact detail, the modal will display:

```
┌────────────────────────────────────────────────────────┐
│                    Sarah Chen                          │
├────────────────────────────────────────────────────────┤
│                                                         │
│ Email:        sarah.chen@startup.io                    │
│ Phone:        +1 512 555 6789                          │
│ Website:      startup.io                              │
│ Trust Status: ✓ verified                               │
│ Last Check:   2026-03-04                               │
│ Tags:         founder, investor, startup               │
│ Notes:        CEO at Startup Inc, AI enthusiast        │
│                                                         │
├────────────────────────────────────────────────────────┤
│                    QUICK ACTIONS                        │
│                                                         │
│ [C]all   [E]mail   [M]essage   [N]otes   [D]elete     │
│ [T]rust  [U]ntrust [C]opy Email [P]hone  [O]pen Web  │
│                                                         │
│ Press key for action or 'q' to close                   │
└────────────────────────────────────────────────────────┘
```

### Action Descriptions

| Key | Action | Description | Requires |
|-----|--------|-------------|----------|
| C | Call | Open phone dialer (integration with system dialer) | Phone number |
| E | Email | Compose email (opens email client or draft) | Email address |
| M | Message | Send text message (integration with messaging) | Phone number |
| N | Notes | Edit contact notes | - |
| D | Delete | Remove contact (confirmation required) | - |
| T | Trust | Mark as verified (confirmation) | - |
| U | Untrust | Mark as untrusted/blocked | - |
| C | Copy Email | Copy primary email to clipboard | Email |
| P | Phone | Copy phone to clipboard | Phone |
| O | Open Web | Open contact's website in browser | Domain/website |

## Trust Status Colors

- **Verified** (✓) — Green badge, all actions enabled
- **Pending** (◐) — Yellow badge, limited actions (no messaging)
- **Untrusted** (✗) — Red badge, warning overlay
- **Unknown** (○) — Gray badge, verify button prominent

## Implementation Phases

### Phase 1 (MVP) — Current
- [x] Search and display contacts
- [x] View contact details modal
- [ ] Single-letter keybindings for actions
- [ ] Copy-to-clipboard actions
- [ ] Edit notes in-modal

### Phase 2 (v1.1)
- [ ] Email composition (draft)
- [ ] Phone number formatting and copy
- [ ] Website URL validation and browser integration
- [ ] Trust status toggle with confirmation

### Phase 3 (v1.2) — Integration
- [ ] System call/message integration (if available)
- [ ] Messaging app plugins (Telegram, Signal, etc.)
- [ ] Calendar integration for scheduling
- [ ] CRM sync (mc-crm)

## Keyboard Shortcuts

```
NAVIGATION:
  ↑ / ↓         — Move between contacts
  → / ←         — Page up/down
  Enter         — View contact details
  / (slash)     — Focus search box
  q / Esc       — Close modal/quit

QUICK ACTIONS (in details view):
  c             — Call
  e             — Email
  m             — Message
  n             — Edit Notes
  d             — Delete
  t             — Mark Trusted
  u             — Mark Untrusted
  y             — Copy Email
  p             — Copy Phone
  o             — Open Website
```

## Future: Integration with mc-trust

When mc-trust integration is complete, quick-actions will:

1. **Auto-verify** new contacts via handshake
2. **Revoke** trust status if identity check fails
3. **Expiry management** — re-verify contacts after TTL
4. **Chain of trust** — show verification path and history

Trust status will be read from mc-trust's verified contacts store, and updates will sync back to the trust system.
