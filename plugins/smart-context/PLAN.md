# smart-context — Implementation Plan

> miniclaw plugin: engineered context for channel sessions
> Location: `~/.openclaw/miniclaw/plugins/smart-context/`
> Built ON openclaw, not against it.

---

## The Problem

OpenClaw has two built-in context management systems. Neither is sufficient for channel use.

### Built-in Option 1: Compaction (default / safeguard mode)

Triggered when the context window fills up. Summarizes old messages into a text blob.

**What it does well:**
- Handles extremely long sessions gracefully
- Preserves tool failures, file ops, AGENTS.md critical context in summary
- Chunked summarization for very large histories (safeguard mode)

**What it does NOT do:**
- Does not treat images specially — image cost (est. 8,000 chars each) accumulates until compaction fires
- No time-based logic — a session from 3 days ago is treated the same as one from 3 minutes ago
- Uses the primary model (Sonnet/Opus) to summarize — expensive
- Compaction fires reactively, not proactively — context is already bloated before it triggers
- No QMD/memory injection — summary is LLM-generated, not semantically grounded
- No channel-vs-DM awareness — same policy everywhere

### Built-in Option 2: Context Pruning (cache-ttl mode)

Trims old **tool results** from in-memory context after the Anthropic cache TTL expires.

**What it does well:**
- Reduces cacheWrite cost on post-TTL requests
- Soft-trim (keep head/tail) and hard-clear modes
- Fast — runs in-memory per request

**What it does NOT do:**
- **Explicitly exempts image blocks** — images in tool results are NEVER trimmed
- Only touches tool results — user messages and assistant messages are untouched
- No time-based logic
- No channel awareness
- No QMD injection

### The Gap

Both systems let context **grow** until a threshold fires. Neither lets you **engineer** what goes in.

---

## The Concept: Engineered Context

Instead of managing overflow reactively, we define exactly what belongs in context before every model call:

```
[ QMD memory injection (optional) ]
[ Messages from last X minutes ]
  - Images: only last 2 preserved, older ones stripped to text placeholder
  - Tool results: standard pruning applies (let openclaw handle this)
[ Current message ]
```

This is a sliding window, not a growing ledger.

---

## What We're Building Better

| Feature | Compaction | Pruning | smart-context |
|---|---|---|---|
| Removes old messages from context | ✅ (summarizes) | ❌ | ✅ (time window) |
| Image pruning | ❌ | ❌ (explicitly exempt) | ✅ keep last N |
| Channel-aware | ❌ | ❌ | ✅ opt-in per session type |
| QMD memory injection | ❌ | ❌ | ✅ |
| Proactive (not reactive) | ❌ | ❌ | ✅ |
| Preserves recent summary | ✅ | ❌ | ✅ (via prependContext) |
| Model cost for context mgmt | High (Sonnet) | None | Low (Haiku, optional) |
| Configurable | Limited | Limited | Full |

---

## Architecture

### Phase 1 — Works With Current API (ship now)

Uses only what the plugin API supports today:
- `before_prompt_build` hook → read messages, inject engineered context via `prependContext`
- `before_model_resolve` hook → optionally swap to Haiku for channel sessions
- `registerCommand` → `/context-status`, `/context-window` slash commands

**Limitation of Phase 1:** We can read messages but cannot replace them. The full history still
goes to the model. prependContext prepends our engineered summary BEFORE the user's message,
but the raw message history is still there underneath. This is still valuable — the model gets
a clean, structured context summary up front — but it does not actually reduce token usage.

### Phase 2 — Upstream PR (unblocks full implementation)

Single PR to openclaw:

**File:** `src/plugins/types.ts`
```typescript
// Add to PluginHookBeforePromptBuildResult:
messages?: AgentMessage[];  // If returned, replaces active session messages for this run
```

**File:** `src/agents/pi-embedded-runner/run/attempt.ts` (~line 1375)
```typescript
if (hookResult?.messages && Array.isArray(hookResult.messages)) {
  activeSession.agent.replaceMessages(hookResult.messages);
}
```

This is ~15 lines of code. Once merged, Phase 3 is unlocked.

### Phase 3 — Full Engineered Context (after Phase 2)

Plugin returns a `messages` array that is the engineered window:
- Messages from last X minutes only
- Images stripped from all but the last 2 image-bearing messages
- Token budget respected
- QMD results prepended as context block

---

## Plugin Structure

```
smart-context/
  openclaw.plugin.json     # manifest
  index.ts                 # entry point
  src/
    context-engineer.ts    # core: builds the engineered message window
    image-pruner.ts        # strips images from messages, keeps last N
    time-filter.ts         # filters messages by age
    qmd-injector.ts        # runs qmd query, formats results for prependContext
    session-classifier.ts  # detects channel vs DM from sessionKey
    config.ts              # plugin config schema + defaults
  package.json
  tsconfig.json
```

---

## Config Schema

```typescript
type SmartContextConfig = {
  // Time window
  windowMinutes: number;           // default: 60 — keep messages from last N minutes
  windowMinMessages: number;       // default: 10 — always keep at least N most recent messages

  // Image pruning
  maxImagesInHistory: number;      // default: 2 — keep only last N image-bearing messages
  imagePlaceholder: string;        // default: "[image removed from history]"

  // QMD injection
  qmd: {
    enabled: boolean;              // default: true
    collection: string;            // default: "workspace"
    maxResults: number;            // default: 3
    maxChars: number;              // default: 2000
    triggerOnChannels: boolean;    // default: true
    triggerOnDMs: boolean;         // default: false
  };

  // Session targeting
  applyToChannels: boolean;        // default: true — group/channel sessions
  applyToDMs: boolean;             // default: false — DM sessions (leave as-is)

  // Phase 2+ (messages mutation)
  replaceMessages: boolean;        // default: false — enable only after openclaw PR merged

  // Haiku for channel context builds
  useHaikuForChannels: boolean;    // default: false (Phase 2+: use before_model_resolve)
};
```

---

## Core Logic: `context-engineer.ts`

```typescript
async function engineerContext(
  messages: unknown[],
  config: SmartContextConfig,
  sessionKey: string,
  prompt: string,
): Promise<EngineeredContext> {

  // 1. Classify session
  const isChannel = isChannelSession(sessionKey);
  if (isChannel && !config.applyToChannels) return { skip: true };
  if (!isChannel && !config.applyToDMs) return { skip: true };

  // 2. Apply time window
  const windowed = filterByTimeWindow(messages, {
    windowMinutes: config.windowMinutes,
    minMessages: config.windowMinMessages,
  });

  // 3. Strip old images (Phase 1: for prependContext summary; Phase 3: for messages return)
  const pruned = pruneImages(windowed, {
    maxImages: config.maxImagesInHistory,
    placeholder: config.imagePlaceholder,
  });

  // 4. Build context summary (for prependContext)
  const contextSummary = buildContextSummary(pruned, messages);

  // 5. QMD injection
  let qmdContext = '';
  if (config.qmd.enabled) {
    qmdContext = await runQmdQuery(prompt, config.qmd);
  }

  // 6. Assemble prependContext
  const parts: string[] = [];
  if (qmdContext) parts.push(`## Memory\n${qmdContext}`);
  if (contextSummary) parts.push(`## Recent Context\n${contextSummary}`);

  return {
    prependContext: parts.join('\n\n'),
    // Phase 3: also return pruned messages for replacement
    messages: config.replaceMessages ? pruned : undefined,
  };
}
```

---

## Session Classifier: `session-classifier.ts`

From the source: session keys for channel sessions always contain `:group:` or `:channel:`.
DMs contain `:direct:` or resolve to `agent:main:main`.

```typescript
function isChannelSession(sessionKey?: string): boolean {
  if (!sessionKey) return false;
  return sessionKey.includes(':group:') || sessionKey.includes(':channel:');
}

function isDMSession(sessionKey?: string): boolean {
  if (!sessionKey) return false;
  return sessionKey === 'agent:main:main' || sessionKey.includes(':direct:');
}
```

---

## Image Pruner: `image-pruner.ts`

```typescript
// Walk messages newest-first.
// Track how many image-bearing messages we've kept.
// Once we've kept maxImages, strip images from all older ones.
function pruneImages(messages: AgentMessage[], opts: PruneOpts): AgentMessage[] {
  let imagesKept = 0;

  // Identify image-bearing messages (newest first)
  const withIndex = messages
    .map((m, i) => ({ msg: m, idx: i, hasImage: messageHasImage(m) }))
    .reverse(); // newest first

  const keepSet = new Set<number>();
  for (const { idx, hasImage } of withIndex) {
    if (hasImage && imagesKept < opts.maxImages) {
      keepSet.add(idx);
      imagesKept++;
    }
  }

  return messages.map((msg, idx) => {
    if (!messageHasImage(msg)) return msg;
    if (keepSet.has(idx)) return msg; // keep image
    return stripImages(msg, opts.placeholder); // replace image blocks with placeholder text
  });
}
```

---

## QMD Injector: `qmd-injector.ts`

```typescript
import { execSync } from 'child_process';

async function runQmdQuery(prompt: string, opts: QmdConfig): Promise<string> {
  try {
    const result = execSync(
      `qmd query ${JSON.stringify(prompt)} --collection ${opts.collection} --limit ${opts.maxResults}`,
      { encoding: 'utf8', timeout: 5000 }
    );
    return result.slice(0, opts.maxChars);
  } catch {
    return ''; // qmd unavailable — degrade gracefully
  }
}
```

---

## Commands (registerCommand)

```
/context-status   → show current window stats: N messages kept, N images pruned, N dropped by age
/context-window   → show which messages are in the current window
/context-reset    → force a fresh window (drops all history for this session)
```

---

## Manifest: `openclaw.plugin.json`

```json
{
  "id": "miniclaw-smart-context",
  "name": "Smart Context",
  "description": "Engineered context windows for channel sessions: time-based message retention, image pruning, and QMD memory injection.",
  "configSchema": {
    "type": "object",
    "additionalProperties": false,
    "properties": {
      "windowMinutes":      { "type": "number" },
      "windowMinMessages":  { "type": "number" },
      "maxImagesInHistory": { "type": "number" },
      "imagePlaceholder":   { "type": "string" },
      "qmd":                { "type": "object" },
      "applyToChannels":    { "type": "boolean" },
      "applyToDMs":         { "type": "boolean" },
      "replaceMessages":    { "type": "boolean" },
      "useHaikuForChannels":{ "type": "boolean" }
    }
  }
}
```

---

## openclaw.json Integration

```json
{
  "plugins": {
    "enabled": true,
    "load": {
      "paths": ["~/.openclaw/miniclaw/plugins/smart-context"]
    },
    "entries": {
      "miniclaw-smart-context": {
        "enabled": true,
        "config": {
          "windowMinutes": 60,
          "windowMinMessages": 10,
          "maxImagesInHistory": 2,
          "applyToChannels": true,
          "applyToDMs": false,
          "qmd": {
            "enabled": true,
            "collection": "workspace",
            "maxResults": 3,
            "maxChars": 2000,
            "triggerOnChannels": true,
            "triggerOnDMs": false
          },
          "replaceMessages": false
        }
      }
    }
  }
}
```

---

## Implementation Order

### Step 1 — Scaffold (today)
- [ ] `package.json`, `tsconfig.json`, `openclaw.plugin.json`
- [ ] `index.ts` with `register(api)` shell
- [ ] `session-classifier.ts` — session key parsing
- [ ] Wire `before_prompt_build` hook, log what we see

### Step 2 — QMD Injection (today, Phase 1 value)
- [ ] `qmd-injector.ts`
- [ ] Return `prependContext` with QMD results for channel sessions
- [ ] Test against real TG channel session

### Step 3 — Image Pruner (today, Phase 1 partial value)
- [ ] `image-pruner.ts`
- [ ] Strip images in the prependContext summary (even if full history still goes to model)
- [ ] Report image counts in `/context-status`

### Step 4 — Time Filter (today, Phase 1 partial value)
- [ ] `time-filter.ts`
- [ ] Filter messages by age in prependContext summary

### Step 5 — Upstream PR (next)
- [ ] Add `messages?: AgentMessage[]` to `PluginHookBeforePromptBuildResult`
- [ ] Wire in `attempt.ts`
- [ ] PR to openclaw/openclaw

### Step 6 — Full Messages Mutation (after PR merged)
- [ ] Set `replaceMessages: true` in config
- [ ] Return filtered+pruned messages from hook
- [ ] Validate token budget before returning
- [ ] Full engineered context — done

---

## Files To Create

```
~/.openclaw/miniclaw/plugins/smart-context/
  PLAN.md                        ← this file
  openclaw.plugin.json
  package.json
  tsconfig.json
  index.ts
  src/
    context-engineer.ts
    image-pruner.ts
    time-filter.ts
    qmd-injector.ts
    session-classifier.ts
    config.ts
```
