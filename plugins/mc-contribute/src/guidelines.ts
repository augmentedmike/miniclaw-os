/**
 * Contribution guidelines injected into the agent's context.
 * This is what the contributor's bot reads to know the rules.
 */

export const CONTRIBUTION_GUIDELINES = `
## MiniClaw Contribution Guidelines

You are helping your human contribute to MiniClaw-OS (github.com/augmentedmike/miniclaw-os).
Follow these rules exactly.

### Architecture
- MiniClaw is a cognitive architecture. Plugins map to brain regions.
- Categories: planning, memory, communication, creation, security, utility.
- One plugin, one job. Do not combine unrelated functionality.
- Plugins communicate through shared state, not direct imports.

### Plugin Structure (required)
\`\`\`
plugins/mc-<name>/
├── openclaw.plugin.json   # id, name, description, configSchema
├── package.json           # type: "module", main: "index.ts"
├── index.ts               # export default register(api)
├── tools/definitions.ts   # agent-callable tools
├── cli/commands.ts        # CLI subcommands (Commander.js)
└── docs/README.md         # brain region, description
\`\`\`

### Code Style
- TypeScript for all plugin code
- Keep it simple — no over-engineering, no premature abstractions
- Tools return { content: [{ type: "text", text: "..." }], details: {} }
- Config resolved early, passed to tools/CLI
- Use the vault for secrets — NEVER hardcode tokens, keys, or passwords

### Security (MANDATORY)
- The pre-commit hook (scripts/security-check.sh) runs on every commit
- It scans for: API keys, tokens, passwords, PII, private keys, .env files
- Commits with secrets are BLOCKED. Fix the issue, do not bypass the hook.
- Never commit real names, emails, phone numbers, or personal data
- Use example.com for placeholder emails, generic names for placeholder contacts

### Branch Naming
- contrib/<plugin-name> for new plugins
- contrib/fix-<description> for bug fixes
- contrib/docs-<topic> for documentation

### PR Requirements
- Title under 70 characters
- Summary: 1-3 bullet points of what changed
- List affected plugins
- Security checklist must be checked
- Run ./scripts/security-check.sh --all before submitting

### Bug Reports
- Use the Bug Report issue template
- Include: what happened, what you expected, steps to reproduce
- Include mc-doctor output
- Include macOS version, Node version, mc --version

### Feature Requests
- Use the Feature Request issue template
- Describe the problem it solves, not just the solution
- Identify which brain region / plugin it belongs to

### Plugin Ideas
- Use the Plugin Idea issue template
- Name it mc-<something>
- Identify the cognitive function / brain region
- List the tools it would expose
- Include example CLI usage

### Discussions
- Use GitHub Discussions for architecture ideas, questions, and community talk
- Tag discussions with the relevant plugin name
- Be constructive — explain trade-offs, not just opinions

### Testing
- Test your plugin with: mc plugin test mc-<name>
- Run the security check: ./scripts/security-check.sh --all
- Verify the pre-commit hook passes on your commits
`.trim();
