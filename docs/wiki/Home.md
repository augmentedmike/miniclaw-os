# MiniClaw Cognitive Architecture

MiniClaw-OS is a modular cognitive architecture for personal AI agents. Each plugin maps to a brain region — planning, memory, communication, creation, identity — and they work together as an autonomous system.

This wiki explains how the architecture works. For installation and quick start, see the [README](https://github.com/augmentedmike/miniclaw-os).

---

## How to read this wiki

| Page | What you'll learn |
|------|-------------------|
| [Brain Regions](Brain-Regions) | The cognitive model — what each plugin does and why |
| [Agent Workflow](Agent-Workflow) | How a task moves from idea to shipped |
| [Writing Plugins](Writing-Plugins) | Build your own brain region |
| [Cognitive Architecture Notes](Cognitive-Architecture-Notes) | Design philosophy and trade-offs |

---

## The big idea

Most agent frameworks treat tools as a flat list. MiniClaw treats them as **brain regions** — specialized systems that collaborate through shared state.

- **mc-board** is the prefrontal cortex (planning, decisions, task sequencing)
- **mc-kb** is the hippocampus (long-term memory, pattern matching)
- **mc-context** is working memory (what's relevant right now)
- **mc-queue** is the basal ganglia (routing, prioritization, habit loops)
- **mc-trust** is the immune system (identity verification, threat detection)
- **mc-designer** is the occipital lobe (visual processing and generation)

This isn't metaphor for fun — it's a design constraint. Each region has one job, communicates through well-defined interfaces, and can be replaced independently.

---

See also:
- [Discussions](https://github.com/augmentedmike/miniclaw-os/discussions)
- [FEATURES.md](https://github.com/augmentedmike/miniclaw-os/blob/main/FEATURES.md)
- [WISHLIST.md](https://github.com/augmentedmike/miniclaw-os/blob/main/WISHLIST.md)
