# MiniClaw

**Give your Mac an AI that actually works for you.**

MiniClaw is a personal AI assistant that lives on your computer — not in a cloud somewhere. It has a real personality, remembers your life, and can actually do things: send emails, write code, manage your calendar, run your projects. It's yours forever, it never gets shut down, and no one else can read your conversations.

---

## What does it feel like?

Imagine having a brilliant friend who happens to know everything — and they're always available. You can:

- **Ask it to do things** — "Draft a reply to that last email from Sarah"
- **Have it work in the background** — it checks your calendar, monitors your inbox, runs tasks overnight
- **Talk to it like a person** — it remembers what you said yesterday, last week, last year
- **Trust it completely** — everything stays on your machine

---

## What do you need?

- A Mac (any Mac made after 2020 works great)
- An internet connection for the first setup
- About 15 minutes

That's it. You don't need to know how to code. You don't need to be "technical." If you can install an app from the internet, you can do this.

---

## Install

Open your **Terminal** app. (It's in Applications → Utilities → Terminal. Looks like a black window with a blinking cursor.)

Paste this and press Enter:

```bash
curl -fsSL https://raw.githubusercontent.com/augmentedmike/miniclaw-os/main/bootstrap.sh | bash
```

It will ask you a few questions, install everything it needs, and set itself up. The whole process takes about 10–15 minutes depending on your internet speed.

When it's done, you'll see:

```
✓ MiniClaw is ready.
```

---

## After install

Start talking to your AI by opening your favorite chat app — MiniClaw connects to Telegram, WhatsApp, iMessage, and more. The installer will walk you through linking one.

Or you can open a browser and go to `http://localhost:18789` to chat right from your computer.

---

## What does it install?

The installer sets up everything from scratch — no manual steps, no guessing. Here's what it does in plain English:

1. Installs Homebrew (a tool that installs other tools — the whole Mac developer community uses it)
2. Installs Node.js and Python (the languages MiniClaw runs in)
3. Installs OpenClaw, the AI engine that powers everything
4. Installs the MiniClaw "brain plugins" — memory, vision, planning, and security
5. Sets up a private vault to keep your API keys and passwords safe
6. Starts everything up and verifies it's working

**Safe to re-run.** If something goes wrong or you want to update, just run the same command again. It skips anything that's already installed and only fixes what needs fixing.

---

## Is it safe?

Yes. A few things worth knowing:

- **Everything runs on your Mac.** Your conversations, your data, your memory — none of it leaves your machine unless you explicitly ask it to do something online.
- **The code is open source.** You can read every line at [github.com/augmentedmike/miniclaw-os](https://github.com/augmentedmike/miniclaw-os). Nothing hidden, nothing suspicious.
- **The installer uses Homebrew** — the same tool millions of developers use every day on macOS. Standard stuff.

---

## If something breaks

Run this in Terminal:

```bash
mc-doctor
```

It will diagnose the problem and ask if you want it to fix things automatically. Usually says yes.

Or run:

```bash
mc-smoke
```

This gives you a quick health check — green means everything is working.

---

## The brain regions (for the curious)

MiniClaw is built on a metaphor: your AI has a brain, and each part of the brain does something specific.

| Part | What it does |
|------|-------------|
| **Prefrontal Cortex** (`mc-board`) | Tracks work — a kanban board your AI uses to manage tasks and projects |
| **Occipital Lobe** (`mc-designer`) | Vision and image creation — generates and edits images with Gemini |
| **Hippocampus** (`mc-context`) | Memory — manages what your AI remembers and for how long |
| **Immune System** (`mc-trust`) | Security — verifies the identity of other AI agents it works with |

You don't need to interact with any of these directly. They just work.

---

## Powered by

- [OpenClaw](https://openclaw.ai) — the AI agent runtime underneath MiniClaw
- [Gemini](https://aistudio.google.com) — image generation (free API key required for visuals)
- Your choice of LLM — Claude, GPT-4, or others through your own API keys

---

## Questions?

Book 30 minutes with Michael, the founder: [miniclaw.bot](https://miniclaw.bot)

He'll set it up with you over screenshare. $100 for a session. No subscription.

---

## License

Open source. Built by [AugmentedMike](https://augmentedmike.com).
