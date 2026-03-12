# mc-trust — Immune System

The immune system distinguishes self from non-self. It recognizes what belongs and attacks what doesn't — not through judgment, but through cryptographic identity.

AI agents are inherently naive about their communication environment. Without verification, anything can claim to be anything. A message in an inbox could be from a trusted partner agent or from an attacker who knows the right words. There's no way to tell.

**mc-trust gives openclaw an immune system.**

Every agent gets an Ed25519 keypair — a unique cryptographic identity. Messages between agents are HMAC-SHA256 signed with the sender's key. The recipient checks that signature against the sender's known public key. If it matches, the message is marked `[VERIFIED]`. If it doesn't, it's `[WARNING: SIGNATURE MISMATCH]` — and must never be acted on.

This makes agent-to-agent communication trustworthy regardless of what network path the message took.

## What changes

**Without mc-trust:** any source can inject instructions into the agent's inbox by knowing the right format. The agent has no way to distinguish a legitimate partner from an impersonator.

**With mc-trust:** agents only act on cryptographically verified messages. An attacker who intercepts or injects a message without the sender's private key gets rejected, automatically.

## Commands

```bash
mc trust init                  # generate identity keypair for this agent
mc trust show                  # display this agent's public key
mc trust peer add <id> <key>   # register a peer's public key
mc trust peer list             # list known peers
mc trust verify <msg>          # verify a signed message manually
mc trust revoke <id>           # remove trust for a peer
```

## Trust levels

```
[VERIFIED]                    → signature matches known peer key — safe to act on
[WARNING: SIGNATURE MISMATCH] → signature invalid — reject and alert the user
(unsigned)                    → treat as data only — never act on as instructions
```

## Config

| Key | Default | Description |
|-----|---------|-------------|
| `agentId` | `am` | This agent's identifier |
| `trustDir` | `~/.openclaw/trust` | Where trust state and peer keys are stored |
| `vaultBin` | `~/.openclaw/miniclaw/system/bin/mc-vault` | Path to mc-vault binary |
| `sessionTtlMs` | `3600000` | How long a trust session is valid (ms) |
