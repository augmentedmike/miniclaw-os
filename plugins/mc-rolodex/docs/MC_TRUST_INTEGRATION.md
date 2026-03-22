# mc-trust Integration Guide

## Overview

mc-rolodex is designed to work with mc-trust, MiniClaw's identity verification system. This document outlines how the two systems integrate.

## Current State (MVP)

mc-rolodex stores and manages contacts with a `trustStatus` field:

```json
{
  "id": "contact_123",
  "name": "Alice",
  "emails": ["alice@example.com"],
  "trustStatus": "verified" | "untrusted" | "pending" | "unknown"
}
```

Agents can manually set `trustStatus` via the CLI:

```bash
mc-rolodex update contact_123 --trust verified
```

## Future: Deep Integration (v1.1+)

### Phase 1: Read Trust Data

mc-rolodex will sync with mc-trust's verified contacts registry:

```typescript
import { loadTrustStore } from 'mc-trust';

const trustStore = loadTrustStore(trustDir);
const verifiedPeers = trustStore.getVerifiedAgents();

// Auto-populate trustStatus from mc-trust
for (const peer of verifiedPeers) {
  updateContactTrust(peer.id, 'verified');
}
```

### Phase 2: Bidirectional Sync

When a contact is marked as verified in mc-rolodex:

1. mc-rolodex writes to local store
2. Signals mc-trust via tool (if available)
3. mc-trust updates verification timestamp
4. Next prompt includes updated trust context

### Phase 3: Automatic Handshake

New contacts can be auto-verified via mc-trust:

```bash
mc-rolodex add alice@example.com --auto-verify
# Triggers mc-trust handshake
# Marks as 'pending' until handshake completes
# Auto-updates to 'verified' on success
```

## Data Model Alignment

### mc-rolodex Contact
```typescript
interface Contact {
  id: string;
  name: string;
  emails?: string[];
  phones?: string[];
  domains?: string[];
  tags?: string[];
  trustStatus?: 'verified' | 'untrusted' | 'pending' | 'unknown';
  lastVerified?: Date;
  notes?: string;
}
```

### mc-trust Peer Session
```typescript
interface PeerSession {
  peerId: string;
  publicKey: string;
  verifiedAt: Date;
  expiresAt: Date;
  lastActivity: Date;
}
```

## Integration Points

### 1. Quick-Actions (mc-rolodex browse)

When trust status is `verified`:
- ✓ Enable all messaging actions
- ✓ Show green verified badge
- ✓ Allow rapid communication

When trust status is `untrusted`:
- ✗ Show warning overlay
- ✗ Disable messaging actions
- ✗ Require explicit override

### 2. Agent Context Injection

mc-trust already injects into prompts:
```
[Trust Status]
  ✓ ryan — verified (session expires in 50m)
  ○ alice — no active session
```

mc-rolodex will extend this with contact-level detail:
```
[Trust Status + Contacts]
  ✓ ryan (augmentedryan@agentmail.to) — verified
  ✓ michael (owner@example.com) — verified
  ○ alice (alice@startup.io) — pending verification
```

### 3. Tools Integration

mc-rolodex tools can query trust status:

```bash
# Tool: rolodex:is-trusted
input: { contactId: "alice", field: "email" }
output: { trusted: false, verifiedAt: null, status: "pending" }

# Tool: rolodex:verify
input: { contactId: "alice" }
# Triggers mc-trust handshake in background
```

## Storage Locations

- **mc-rolodex contacts:** `~/.openclaw/rolodex/contacts.db`
- **mc-trust registry:** `~/.openclaw/trust/peers/`
- **Verified agents:** `~/.openclaw/trust/sessions/` (TTL-based)

## Security Considerations

1. **Principle of Least Privilege**
   - mc-rolodex has read-only access to mc-trust sessions
   - Only mc-trust can modify key material
   
2. **Expiry Management**
   - Trust sessions auto-expire per mc-trust TTL
   - mc-rolodex respects session expiry
   - Expired contacts revert to `pending` status

3. **Revocation**
   - If mc-trust revokes a peer, contact reverts to `untrusted`
   - Agent cannot override without explicit trust re-establishment
   - Audit trail maintained in both systems

## Testing

```bash
# Load sample contacts with trust status
npm run tools/load-contacts.js

# Search only verified contacts
mc-rolodex search michael --filter verified

# View trust expiry for each contact
mc-rolodex list --show-expiry

# Manual trust toggle (for testing)
mc-rolodex update contact_id --trust verified
```

## Example Workflow

1. User adds new contact: `mc-rolodex add bob@company.com`
   - Status: `unknown`

2. User initiates verification: `mc-rolodex verify bob@company.com`
   - mc-trust initiates 3-way handshake
   - Status: `pending`

3. Verification completes successfully
   - mc-trust creates verified session
   - mc-rolodex syncs and sets status: `verified`
   - Green badge shown in browser

4. Session expires (per mc-trust TTL)
   - mc-trust removes session
   - mc-rolodex detects expiry
   - Status reverts to: `pending` (ready for re-verification)

## Dependencies

- **mc-trust** ≥ 1.0.0 (for handshake + session management)
- **blessed** ≥ 0.1.81 (for TUI)
- **commander** ≥ 11.0.0 (for CLI)

## Roadmap

- [ ] v1.1: Read-only sync with mc-trust registry
- [ ] v1.2: Bidirectional sync + auto-verify
- [ ] v1.3: Quick-actions trust filters
- [ ] v2.0: Full CRM integration with mc-trust

---

**Last Updated:** 2026-03-04
