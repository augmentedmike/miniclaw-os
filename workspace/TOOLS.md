# TOOLS.md — Local Tool Reference

All tools are accessed via `openclaw mc-<plugin> <command>`. Never call underlying tools directly — always use the mc-plugin wrapper.

## File Paths

- **Projects/repos:** `~/.openclaw/miniclaw/USER/projects/`
- **Research/docs/playbooks:** `~/.openclaw/miniclaw/USER/docs/`
- **Memory (short-term):** `~/.openclaw/USER/memory/`
- **Blog posts:** `~/.openclaw/USER/blog/posts/`
- **Media/attachments:** `~/.openclaw/USER/bin/media/`

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

Unified gateway — routes to mc-memo (short-term) and mc-kb (long-term). Handles promotion between them.

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
openclaw mc-email check [--limit 20]                          # list unread inbox
openclaw mc-email read <id>                                    # read a message by UID
openclaw mc-email send --to "addr" --subject "..." --body "..."
openclaw mc-email reply <id> --body "..."
openclaw mc-email archive <id>                                 # move to All Mail
openclaw mc-email triage [--dry-run] [--limit 20]             # autonomous triage
openclaw mc-email auth                                         # store app password
```

---

## Vault (mc-vault)

Standalone tool — not an openclaw plugin. Call directly.

```bash
mc-vault get <key>
mc-vault export <key>        # raw value (for piping)
mc-vault set <key> <value>
mc-vault list
mc-vault rm <key>
```

---

## Contacts (mc-rolodex)

```bash
openclaw mc-rolodex list [--tag <tag>]
openclaw mc-rolodex search "name or email" [--type email|phone|domain]
openclaw mc-rolodex show <contact_id>
openclaw mc-rolodex add '{"name":"...","emails":["..."]}'
openclaw mc-rolodex delete <contact_id>
```

---

## Soul (mc-soul)

Identity — personality traits, values, voice. Loaded into every conversation.

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
openclaw mc-reflection gather [--date YYYY-MM-DD]   # collect day's context
openclaw mc-reflection list [--limit N]              # list past reflections
openclaw mc-reflection show <id_or_date>             # show by ID or date
```

---

## Trust (mc-trust)

Agent identity — Ed25519 keypairs, cryptographic verification, mutual handshake.

```bash
openclaw mc-trust init                        # generate identity keypair
openclaw mc-trust pubkey                      # print public key (safe to share)
openclaw mc-trust add-peer <id> <pubkey>      # register a peer's public key
openclaw mc-trust list-peers                  # list known peers
openclaw mc-trust challenge <peer_id>         # initiate handshake
openclaw mc-trust respond <json>              # respond to handshake
openclaw mc-trust complete <json>             # verify response, establish session
openclaw mc-trust finish <json>               # complete mutual auth (responder side)
openclaw mc-trust sessions                    # list active trust sessions
openclaw mc-trust sign <message>              # sign a message
openclaw mc-trust verify <message>            # verify a signed message
```

---

## Designer (mc-designer)

Gemini-powered image generation with layers and compositing.

```bash
openclaw mc-designer gen <prompt>                          # generate image
openclaw mc-designer edit <canvas> <layer> <instructions>  # edit a layer
openclaw mc-designer canvas new|list|show|rm               # canvas management
openclaw mc-designer layer add|rm|mv|opacity|toggle|rename|blend
openclaw mc-designer composite <canvas>                    # flatten → PNG
openclaw mc-designer alpha strip <file>                    # remove background
openclaw mc-designer stats [--full]                        # usage + cost
```

---

## Blog (mc-blog)

```bash
openclaw mc-blog list                    # list posts
openclaw mc-blog show <id>               # show post
openclaw mc-blog create-seed             # create post metadata
openclaw mc-blog write-body <id>         # write post content
openclaw mc-blog generate-addendum <id>  # self-analysis
openclaw mc-blog writing-brief           # get voice rules + context
```

---

## Booking (mc-booking)

```bash
openclaw mc-booking setup                # guided Turso DB setup
openclaw mc-booking slots                # list available slots
openclaw mc-booking list [-n <limit>]    # list upcoming appointments
openclaw mc-booking show <token>         # appointment details
openclaw mc-booking cancel <token>       # cancel + refund
openclaw mc-booking config [key] [value] # view/set config
openclaw mc-booking serve                # start HTTP server (port 4221)
```

---

## Stripe (mc-stripe)

```bash
openclaw mc-stripe setup                                     # vault keys, verify
openclaw mc-stripe charge <amount> <currency> <description>  # create payment
openclaw mc-stripe refund <payment-intent-id> [--amount N]   # full or partial refund
openclaw mc-stripe status <payment-intent-id>                # payment details
openclaw mc-stripe customers list|create                     # customer management
openclaw mc-stripe balance                                   # available + pending
```

---

## Square (mc-square)

```bash
openclaw mc-square setup                                     # vault token, verify
openclaw mc-square charge <amount> <currency> <description>  # create payment
openclaw mc-square refund <payment-id> [--amount N]          # refund
openclaw mc-square status <payment-id>                       # payment details
openclaw mc-square link <amount> <title>                     # hosted checkout URL
openclaw mc-square locations                                 # list Square locations
```

---

## Calendar (mc-calendar)

```bash
openclaw mc-calendar list [--days N]     # upcoming events
openclaw mc-calendar create --title "..." --start "..." --end "..."
openclaw mc-calendar update <id> ...
openclaw mc-calendar delete <id>
openclaw mc-calendar search "query"
```

---

## Tailscale (mc-tailscale)

```bash
openclaw mc-tailscale status             # node status and IPs
openclaw mc-tailscale serve <port>       # expose local port via Tailscale
openclaw mc-tailscale funnel <port>      # expose publicly via Funnel
```

---

## Authenticator (mc-authenticator)

TOTP 2FA — Google Authenticator compatible.

```bash
openclaw mc-auth add <name> <secret> [--issuer X --account Y]
openclaw mc-auth add-uri <name> "otpauth://..."
openclaw mc-auth code <name>             # current 6-digit code + TTL
openclaw mc-auth verify <name> <code>    # verify a code
openclaw mc-auth list                    # list services
openclaw mc-auth remove <name>
```

---

## Contribute (mc-contribute)

```bash
openclaw mc-contribute scaffold <name>           # scaffold new plugin
openclaw mc-contribute branch <topic>            # create contrib/ branch
openclaw mc-contribute security [--all]          # run security scanner
openclaw mc-contribute pr -t "..." -s "..."      # push + create PR
openclaw mc-contribute status                    # branch, changes, open PRs
openclaw mc-contribute guidelines                # print contribution rules
```

---

## Context (mc-context)

Automatic — runs on every prompt build. Manual status commands:

```bash
/context-status     # window stats: messages kept, images pruned, dropped by age
/context-window     # which messages are in the current window
/context-reset      # force a fresh window
```

---

## Docs (mc-docs)

```bash
openclaw mc-docs create "Title" --author "..." [--tags "a,b" --card-id crd_X]
openclaw mc-docs edit <doc_id> "content" --author "..." --message "..."
openclaw mc-docs list [--tag X | --card-id X]
openclaw mc-docs show <doc_id> [--raw]
openclaw mc-docs versions <doc_id>
```

---

## Substack (mc-substack)

```bash
openclaw mc-substack auth                # store auth cookie
openclaw mc-substack draft --title "..." --body "..."
openclaw mc-substack publish <draft_id>
openclaw mc-substack list
```

---

## Reddit (mc-reddit)

```bash
openclaw mc-reddit auth --cookies '<cookie_string>'
openclaw mc-reddit post -s <subreddit> -t "Title" -c "Content"
openclaw mc-reddit comment -p <post_id> -c "Comment"
openclaw mc-reddit feed [--subreddit X]
```

---

## X / Twitter (mc-x)

```bash
openclaw mc-x auth --token '<bearer>'
openclaw mc-x post "tweet content"
openclaw mc-x timeline [--limit N]
openclaw mc-x reply <tweet_id> "reply content"
```

---

## Moltbook (mc-moltbook)

Social network for AI agents.

```bash
openclaw mc-moltbook status              # profile and connection
openclaw mc-moltbook register            # register on Moltbook
openclaw mc-moltbook feed [--sort hot|new|top|rising]
openclaw mc-moltbook post -s <community> -t "Title" -c "Content"
openclaw mc-moltbook reply -p <post_id> -c "Reply"
openclaw mc-moltbook communities         # list communities
```

---

## SEO (mc-seo)

```bash
openclaw mc-seo audit <domain>
openclaw mc-seo keywords <domain>
openclaw mc-seo sitemap submit <url>
```

---

## YouTube (mc-youtube)

```bash
openclaw mc-youtube analyze <url>        # keyframe extraction + analysis
```

---

## Devlog (mc-devlog)

```bash
openclaw mc-devlog generate [--date YYYY-MM-DD]   # generate daily devlog from git
```

---

## Update (mc-update)

```bash
openclaw mc-update check                 # check for new version
openclaw mc-update apply                 # apply update with smoke test
```

---

## Standalone Tools

These are NOT openclaw plugins — call directly:

```bash
mc-vault get|set|list|rm|export          # age-encrypted secrets
mc-doctor                                 # full diagnosis + auto-repair
mc-smoke                                  # quick health check
mc-chrome                                 # browser automation
```
