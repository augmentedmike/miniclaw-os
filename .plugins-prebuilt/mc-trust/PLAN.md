# mc-trust — PLAN

**Brain analog**: —
**Role**: Cross-agent trust and identity. Cryptographic handshakes between AI agents running on different machines.

---

## Phases

### Phase 1 — Key management + CLI ✅ (built)

- Identity key generation (age keypair per agent)
- `trust` CLI: `trust init / show / handshake / verify / revoke`
- Agent tool definitions for trust operations

### Phase 2 — Handshake protocol ✅ (built)

- HMAC-SHA256 signed messages between agents
- `[VERIFIED]` / `[WARNING: SIGNATURE MISMATCH]` status on incoming messages
- Session TTL — trust expires after configurable duration

### Phase 3 — Multi-agent mesh

- Trust registry shared across agents (synced via encrypted file or QMD)
- Agent A can vouch for Agent C to Agent B (transitive trust, one hop)
- Revocation propagation across mesh

### Phase 4 — Channel trust

- Per-channel trust levels (Telegram groups, DMs)
- Trust-gated commands: only verified agents can trigger certain tools
- Audit log of all trust events

### Future

- Hardware-backed identity (Secure Enclave on Apple Silicon)
- Time-limited delegated trust (e.g. agent B trusted for 1 hour to act as A)
- Public key pinning via DNS TXT records for domain-level verification
