# Writing Plugins

How to build your own MiniClaw brain region.

---

## Plugin Structure

Every plugin lives in `plugins/` and follows this layout:

```
plugins/mc-my-plugin/
├── openclaw.plugin.json   # Plugin metadata and config schema
├── package.json           # Node.js metadata
├── index.ts               # Main entry point (lifecycle hooks)
├── src/                   # Source code
│   └── ...
├── tools/                 # Tool definitions (agent-callable)
│   └── definitions.ts
├── cli/                   # CLI subcommands
│   └── commands.ts
└── docs/
    └── README.md
```

## openclaw.plugin.json

The manifest that tells OpenClaw about your plugin:

```json
{
  "id": "mc-my-plugin",
  "name": "My Plugin",
  "description": "What this plugin does in one sentence.",
  "configSchema": {
    "type": "object",
    "properties": {
      "enabled": { "type": "boolean" }
    }
  }
}
```

## Lifecycle Hooks

Plugins can hook into these events:

| Hook | When it fires | Common use |
|------|--------------|------------|
| `before_model_resolve` | Before choosing which LLM to call | Switch to Haiku for triage |
| `before_prompt_build` | Before assembling the prompt | Inject context (board state, KB results) |
| `before_tool_call` | Before executing a tool | Validate, rate-limit, block |
| `after_tool_call` | After a tool returns | Log usage, update state |
| `message_received` | Incoming message from any channel | Track, filter, route |
| `message_sent` | Outgoing message | Log, audit |
| `llm_output` | After LLM response | Token tracking |
| `agent_end` | Agent session ending | Cleanup, save state |

## Defining Tools

Tools are functions the agent can call. Define them in `tools/definitions.ts`:

```typescript
export const tools = [
  {
    name: "my_plugin_search",
    description: "Search for something in my plugin's data store",
    input_schema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Search query" }
      },
      required: ["query"]
    }
  }
];
```

## Context Injection

The most powerful pattern. Use `before_prompt_build` to prepend relevant data to every prompt:

```typescript
// In index.ts
export function before_prompt_build(context) {
  const relevantData = getRelevantData(context.currentCard);
  return {
    prepend: `## My Plugin Context\n${relevantData}\n`
  };
}
```

This is how mc-board injects the current card, mc-kb injects relevant knowledge, and mc-soul injects personality.

## State Storage

Plugins store state in `~/am/user/<bot_name>/`:

- **SQLite** for structured data (mc-board, mc-kb)
- **JSON files** for config and simple state (mc-rolodex, mc-jobs)
- **Markdown files** for human-readable state (mc-memo)
- **Vault** for secrets (`mc-vault set my-api-key "..."`)

## CLI Subcommands

Add CLI commands in `cli/commands.ts`:

```typescript
export const commands = {
  "search": {
    description: "Search my plugin",
    args: [{ name: "query", required: true }],
    handler: async (args) => {
      // ...
    }
  }
};
```

Users can then run: `mc my-plugin search "query"`

## Testing

```bash
mc plugin test my-plugin
```

## Registration

```bash
mc plugin register ./plugins/my-plugin
mc plugin enable my-plugin
```

---

## Building plugins with MiniClaw

MiniClaw is built with MiniClaw. If you have it installed, your agent can do most of the work for you.

### Scaffold a plugin

```bash
# Ask your agent to create the full plugin structure
openclaw agent "Create a new plugin called mc-weather that fetches weather forecasts. Follow the structure in plugins/mc-kb as a reference."
```

Your agent will create the directory, write `openclaw.plugin.json`, `index.ts`, tool definitions, CLI commands, and a README — all following the patterns from existing plugins.

### Track the build on your board

```bash
mc board create "Build mc-weather plugin" --priority high --tags plugin
```

The board workers will triage the card, fill in an implementation plan and acceptance criteria, then work through it autonomously. You review and approve at the end.

### Search for patterns in existing plugins

```bash
# Have your agent study how context injection works
openclaw agent "Show me how mc-board implements before_prompt_build"

# Search the KB for plugin development lessons
mc kb search "plugin lifecycle hooks"
```

### Test and iterate

```bash
# Your agent can run tests and fix failures in a loop
openclaw agent "Run mc plugin test mc-weather and fix any failures"
```

### Submit your contribution

```bash
# Your agent drafts the PR from your board card
openclaw agent "Create a PR for mc-weather based on card crd_abc123"
```

The pre-commit hook ensures no secrets leak. Your agent respects it.

---

See also:
- [Brain Regions](Brain-Regions) — existing plugins to reference
- [Agent Workflow](Agent-Workflow) — where plugins fit in the lifecycle
- [FEATURES.md](https://github.com/augmentedmike/miniclaw-os/blob/main/FEATURES.md) — all plugin commands
