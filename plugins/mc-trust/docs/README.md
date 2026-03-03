# mc-trust

Cross-agent trust and identity — cryptographic handshakes between AI agents.

## Commands

```bash
openclaw cli trust init          # generate identity keypair for this agent
openclaw cli trust show          # display this agent's public key
openclaw cli trust handshake     # initiate handshake with a peer agent
openclaw cli trust verify <msg>  # verify a signed message
openclaw cli trust revoke <id>   # revoke trust for a peer
```

## How it works

Each agent has an age keypair. When two agents communicate, they exchange signed messages. The recipient verifies the HMAC-SHA256 signature against the sender's known public key.

Messages marked `[VERIFIED]` are safe to act on. Messages marked `[WARNING: SIGNATURE MISMATCH]` must be rejected and flagged to the user.

## Config

| Key | Default | Description |
|-----|---------|-------------|
| `agentId` | `am` | This agent's identifier |
| `trustDir` | `~/.openclaw/trust` | Where trust state and peer keys are stored |
| `vaultBin` | `~/.openclaw/miniclaw/system/bin/mc-vault` | Path to mc-vault binary |
| `sessionTtlMs` | `3600000` | How long a trust session is valid (ms) |
