# mc-vault — Age-Encrypted Secret Store

mc-vault is MiniClaw's credential manager. It stores API keys, tokens, and other secrets encrypted at rest using [age](https://age-encryption.org/) — a modern, audited encryption tool with no configuration surface. Secrets are never written to disk in plaintext.

The vault also supports encrypted private memos: longer freeform notes (plans, context, credentials explanations) stored in the same encrypted format.

---

## Encryption Scheme

mc-vault uses **age** asymmetric encryption with a locally generated X25519 key pair.

### How it works

1. On `init`, `age-keygen` generates a key pair and writes both the private and public portions to a single `key.txt` file (this is age's standard key format — the public key is always recoverable from the private key file).
2. When storing a secret, mc-vault extracts the **public key** from `key.txt` and passes it to `age -r <pubkey>`. The plaintext value is encrypted asymmetrically against that public key.
3. When retrieving a secret, mc-vault passes `key.txt` as the identity file to `age -d -i key.txt`. Age decrypts using the private key embedded in that file.

This means:
- Every `.age` file is independently encrypted to the same key.
- The `key.txt` is the single secret that unlocks everything. Guard it carefully.
- Encrypted files are opaque binary — reading them without the key reveals nothing.

### File layout

```
$OPENCLAW_STATE_DIR/miniclaw/system/vault/
  key.txt          # age private key (mode 600) — the master key
  secrets/
    <name>.age     # one encrypted file per secret
  notes/
    <name>.txt     # plaintext descriptions for each secret (optional)
  memos/
    <name>.age     # encrypted private notes (separate namespace from secrets)
```

On this machine: `~/am/miniclaw/system/vault/`

The vault root can be overridden with `OPENCLAW_VAULT_ROOT`.

### Security properties

- `key.txt` is written with mode `600` (owner read/write only)
- Each `.age` secret file is written with mode `600`
- The vault root directory is created with mode `700`
- There is no passphrase on the key — vault access is controlled by filesystem permissions
- Losing `key.txt` means losing all secrets permanently (no recovery path)

---

## CLI Reference

All commands are available as `mc-vault <command>` or via the `mc vault` alias.

### init — First-time setup

```bash
mc-vault init
```

Generates a new age key pair, creates the vault directory structure, and writes `key.txt`. Fails if a key already exists — will not overwrite.

```
openclaw-vault initialized at /Users/augmentedmike/am/miniclaw/system/vault
Key: /Users/augmentedmike/am/miniclaw/system/vault/key.txt
```

Run this once per installation. `install.sh` runs it automatically if no key is found.

---

### set — Store a secret

```bash
# Inline value
mc-vault set gh-token ghp_xxxxxxxxxxxx

# From stdin (preferred for secrets with special characters)
echo "ghp_xxxxxxxxxxxx" | mc-vault set gh-token -

# Multi-line value from stdin
cat private.key | mc-vault set my-private-key -
```

Encrypts the value and writes it to `secrets/<key>.age`. If a secret with that name already exists, it is silently overwritten.

The `-` form reads from stdin and avoids the secret appearing in shell history or process listings.

---

### get — Retrieve a secret

```bash
mc-vault get gh-token
```

Decrypts and prints the value with a label:

```
gh-token = ghp_xxxxxxxxxxxx
```

Use `get` for interactive inspection. Use `export` when piping to other commands.

---

### export — Raw decrypted output

```bash
mc-vault export gh-token
```

Prints the raw decrypted value with no label or newline prefix — suitable for piping or use in shell `$(...)` expansion:

```bash
GH_TOKEN=$(mc-vault export gh-token)
curl -H "Authorization: token $GH_TOKEN" https://api.github.com/user
```

This is the form plugins use when loading secrets programmatically (see [Plugin Integration](#plugin-integration) below).

---

### list — List stored secrets

```bash
mc-vault list
```

Lists all secret names. If a note exists for a key, it is shown alongside:

```
gh-am-mini                    # GitHub token for AM on mini
gmail-app-password            # Gmail app password for notifications
trust-identity-privkey        # Ed25519 private key for mc-trust
```

Use `note` to attach descriptions (see below).

---

### rm — Remove a secret

```bash
mc-vault rm gh-token
```

Deletes `secrets/gh-token.age` and `notes/gh-token.txt` (if present). Irreversible — the encrypted file is gone.

```
Removed: gh-token
```

---

### note — Attach a description to a secret

```bash
# Set a note
mc-vault note gh-token "GitHub personal access token for AM on mini"

# View the note
mc-vault note gh-token
# → GitHub personal access token for AM on mini
```

Notes are stored in plaintext in `notes/<key>.txt`. They describe the secret without revealing it. Notes appear in `mc-vault list` output.

---

### memo — Encrypted private notes

Memos are encrypted freeform notes stored separately from API keys/credentials. Use them for private context, plans, or sensitive text that isn't a machine-readable secret.

```bash
# Store a memo
mc-vault memo set daily-context "Focus today: finish mc-vault docs, review inbox"

# From stdin (for multi-line content)
cat my-notes.txt | mc-vault memo set daily-context -

# Read a memo
mc-vault memo get daily-context
# === daily-context ===
# Focus today: finish mc-vault docs, review inbox

# List all memos
mc-vault memo list

# Delete a memo
mc-vault memo rm daily-context
```

Memos live in `memos/<name>.age` — independently encrypted, same key as secrets.

---

## Plugin Integration

Plugins access vault secrets by calling the `mc-vault export` command via subprocess. The pattern is:

```typescript
import { spawnSync } from "node:child_process";

function loadSecret(vaultBin: string, key: string): string {
  const result = spawnSync(vaultBin, ["export", key], { encoding: "utf-8" });
  if (result.status !== 0) throw new Error(`vault read failed for key: ${key}`);
  return result.stdout.trim();
}
```

The `vaultBin` path is injected via plugin config so each plugin knows where to find the binary.

### mc-trust example

mc-trust stores the agent's Ed25519 private key in vault under the name `trust-identity-privkey`. On every signing operation, it calls `mc-vault export trust-identity-privkey` to retrieve the raw base64url private key, then constructs a `crypto.KeyObject` from it in memory. The private key never touches disk in plaintext form.

```typescript
// From mc-trust/src/keys.ts
export function loadPrivateKey(vaultBin: string): crypto.KeyObject {
  const result = spawnSync(vaultBin, ["export", VAULT_KEY_NAME], { encoding: "utf-8" });
  if (result.status !== 0) throw new Error("vault read failed — run: openclaw trust init");
  const der = Buffer.from(result.stdout.trim(), "base64url");
  return crypto.createPrivateKey({ key: der, type: "pkcs8", format: "der" });
}
```

### Plugin config

Plugins that need vault access declare a `vaultBin` field in their config schema:

```json
{
  "config": {
    "vaultBin": "~/am/miniclaw/system/bin/mc-vault"
  }
}
```

The path resolves to the live binary. Plugins never import vault internals — they always invoke the CLI.

### Current secrets in use

| Key name | Used by | Description |
|----------|---------|-------------|
| `trust-identity-privkey` | mc-trust | Ed25519 private key for agent authentication |
| `gh-am-mini` | cron / scripts | GitHub token for AM's account on mini |
| `gmail-app-password` | notification scripts | Gmail app password for outbound email |
| `gemini-api-key` | mc-designer | Gemini API key for image generation |

---

## Key Rotation

Key rotation replaces the master `key.txt` with a new age key and re-encrypts all secrets under it. There is no automated rotation command — it is a deliberate manual procedure.

### When to rotate

- If you suspect `key.txt` was exposed or copied
- After removing someone's access to the machine
- As part of a periodic security review

### Rotation procedure

```bash
# 1. Export all current secrets to a temporary plaintext file
#    (do this somewhere secure — /tmp is fine if you clean up)
mc-vault list | while read key _rest; do
  echo "$key=$(mc-vault export "$key")"
done > /tmp/vault-export.txt

# 2. Back up the old vault key (in case something goes wrong)
cp ~/am/miniclaw/system/vault/key.txt ~/am/miniclaw/system/vault/key.txt.bak

# 3. Delete the old key and re-initialize
rm ~/am/miniclaw/system/vault/key.txt
mc-vault init

# 4. Re-import all secrets
while IFS='=' read -r key value; do
  echo -n "$value" | mc-vault set "$key" -
done < /tmp/vault-export.txt

# 5. Verify secrets are readable
mc-vault list

# 6. Clean up the plaintext export
rm /tmp/vault-export.txt
rm ~/am/miniclaw/system/vault/key.txt.bak
```

After rotating, any plugin that cached the old key material will need to re-read from vault. In practice, plugins call `export` on each use so there is nothing to flush.

### Individual secret rotation

To rotate a single secret (e.g., a revoked API key) without touching the master key:

```bash
# Overwrite with the new value
echo -n "new-token-value" | mc-vault set gh-am-mini -

# Verify
mc-vault get gh-am-mini
```

The old `.age` file is overwritten atomically.

---

## Backup

The vault's encrypted files are safe to back up — they are useless without `key.txt`. Back up both together, but store the key separately from the encrypted files when possible.

### What to back up

| Path | Contains | Sensitivity |
|------|----------|-------------|
| `~/am/miniclaw/system/vault/key.txt` | Master decryption key | **Critical** — keep offline copy |
| `~/am/miniclaw/system/vault/secrets/` | Encrypted secret files | Safe to store anywhere |
| `~/am/miniclaw/system/vault/notes/` | Plaintext descriptions | Low sensitivity |
| `~/am/miniclaw/system/vault/memos/` | Encrypted memos | Safe to store anywhere |

### Backup key.txt

```bash
# Copy to an encrypted USB drive or another secure location
cp ~/am/miniclaw/system/vault/key.txt /Volumes/SecureDrive/mc-vault-key.txt.bak

# Or encrypt it again with a passphrase for cloud storage
age -p ~/am/miniclaw/system/vault/key.txt > ~/Desktop/mc-vault-key.age
# (age will prompt for a passphrase — store this passphrase separately)
```

### Restoring from backup

```bash
# Restore the key
cp /path/to/backup/key.txt ~/am/miniclaw/system/vault/key.txt
chmod 600 ~/am/miniclaw/system/vault/key.txt

# Restore secret files (they're already encrypted — just copy them back)
cp -r /path/to/backup/secrets/ ~/am/miniclaw/system/vault/secrets/

# Verify
mc-vault list
mc-vault get <any-key>
```

---

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `OPENCLAW_VAULT_ROOT` | `~/.openclaw/miniclaw/system/vault` | Override vault directory (set to `~/am/miniclaw/system/vault` on this machine via `OPENCLAW_STATE_DIR`) |
| `OPENCLAW_AGE_BIN` | `/opt/homebrew/bin/age` | Path to age binary |
| `OPENCLAW_AGE_KEYGEN_BIN` | `/opt/homebrew/bin/age-keygen` | Path to age-keygen binary |

---

## Troubleshooting

**"Error: No age key found"**
The vault has not been initialized. Run `mc-vault init`.

**"Error: No secret found for 'keyname'"**
The key does not exist. Check `mc-vault list` for the correct name.

**age: decryption failed**
The `key.txt` does not match the key used to encrypt this file. This can happen if you restored secrets from one vault with a key from another. Restore the correct `key.txt`.

**mc-vault: command not found**
The binary is not on PATH. Install it: `ln -sf ~/am/miniclaw/system/bin/mc-vault ~/.local/bin/mc-vault` or re-run `install.sh`.

**Plugin fails to load secret**
Verify the `vaultBin` config points to a working binary: `mc-vault list`. Check the plugin config in `openclaw.json`.
