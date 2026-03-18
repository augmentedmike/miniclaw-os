# TOOLS.md — Local Tool Reference

All tools are accessed via `openclaw mc-<plugin> <command>`. Never call underlying tools directly — always use the mc-plugin wrapper.

## Git / Projects

All cloned repositories MUST go in `~/.openclaw/miniclaw/USER/projects/`.

---

## Board (mc-board)

```bash
openclaw mc-board list                    # list all cards
openclaw mc-board list --column backlog   # filter by column
openclaw mc-board show <card_id>          # full card details
openclaw mc-board create --title "..."    # create a card
openclaw mc-board move <card_id> in-progress
openclaw mc-board update <card_id> --tags "tag1,tag2"
openclaw mc-board context --column backlog
```

---

## Memory (mc-memory)

Short-term goes into markdown files. Long-term goes into KB vectors.

```bash
openclaw mc-memory write "learned something"   # short-term (markdown)
openclaw mc-memory recall "what did we decide"  # search across all memory
openclaw mc-memory list                         # list recent entries
openclaw mc-memory promote                      # promote short-term → long-term KB
```

---

## Knowledge Base (mc-kb)

```bash
openclaw mc-kb search "topic"
openclaw mc-kb add --title "..." --body "..."
openclaw mc-kb list
```

---

## Memo (mc-memo)

```bash
openclaw mc-memo set <key> "working notes for current task"
openclaw mc-memo get <key>
openclaw mc-memo list
openclaw mc-memo clear <key>
```

---

## Email (mc-email)

```bash
openclaw mc-email list --unread --limit 20
openclaw mc-email read <id>
openclaw mc-email send --to "addr" --subject "..." --body "..."
openclaw mc-email reply <id> --body "..."
```

---

## Vault (mc-vault)

```bash
mc-vault get <key>
mc-vault set <key> <value>
mc-vault list
mc-vault rm <key>
```

---

## Contacts (mc-rolodex)

```bash
openclaw mc-rolodex list
openclaw mc-rolodex search "name or email"
openclaw mc-rolodex show <contact_id>
openclaw mc-rolodex update <id> --name "..." --email "..."
```

---

## Soul (mc-soul)

```bash
openclaw mc-soul backup <name>
openclaw mc-soul list
openclaw mc-soul restore <name>
```

---

## Voice (mc-voice)

```bash
openclaw mc-voice transcribe <audio_file>
```

---

## VPN (mc-vpn)

```bash
openclaw mc-vpn status
openclaw mc-vpn connect --country us
openclaw mc-vpn disconnect
```

---

## GitHub (mc-github)

```bash
openclaw mc-github pr-list
openclaw mc-github pr-view <number>
openclaw mc-github pr-review <number>
```

Also: `gh` CLI is available for full GitHub operations.

---

## Backup (mc-backup)

```bash
openclaw mc-backup now
openclaw mc-backup list
```

---

## Reflection (mc-reflection)

```bash
openclaw mc-reflection run
openclaw mc-reflection list
openclaw mc-reflection show <date>
```
