# Example Configs

Pre-built configuration profiles for common MiniClaw setups. Each file is a
JSON config consumable by the headless installer.

## Profiles

| Profile | File | Plugins | Use case |
|---------|------|---------|----------|
| **Minimal** | `minimal.example.json` | 6 core plugins | Local-first personal assistant — task board, knowledge base, contacts, backups |
| **Developer** | `developer.example.json` | 12 plugins | Software engineering — adds GitHub integration, dev logging, CI/CD, testing, monitoring |
| **Content Creator** | `content-creator.example.json` | 14 plugins | Writing & publishing — adds Substack, blog, image generation, social, SEO, email, voice, translation |
| **Headless** | `headless-config.example.json` | All defaults | Full install with all credentials pre-filled (original template) |

## Usage

### 1. Pick a profile

Copy the example that matches your workflow:

```bash
cp examples/minimal.example.json my-config.json
```

### 2. Fill in your credentials

Open the file and replace placeholder values (`YOUR_...`, `ghp_YOUR_...`, etc.)
with your actual tokens. Each field has a `_comment` entry explaining what it is
and where to get it.

### 3. Run the installer

```bash
./install.sh --config my-config.json
```

The installer reads the JSON for identity fields and credentials, stores them in
the local vault, and installs **all** plugins from the repository. The `_plugins`
field in each example is informational — it lists which plugins the profile is
designed around, but install.sh does not filter plugins based on it.

## Customizing

Each profile differs in which credentials are pre-filled. Pick the profile
closest to your use case, then add or remove credential fields as needed. To see
all available plugins and their required credentials:

```bash
cat MANIFEST.json | jq '.plugins[] | {id, requires}'
```

Plugins that don't find their required credentials in the vault will simply
remain inactive after install.

## Credential Reference

| Credential | Used by | Where to get it |
|------------|---------|----------------|
| `ghToken` | mc-board, mc-github | [GitHub Settings → Tokens](https://github.com/settings/tokens) |
| `emailAddress` + `appPassword` | mc-email | Your email provider's app password settings |
| `geminiKey` | mc-designer | [Google AI Studio](https://aistudio.google.com/apikey) |
| `openaiApiKey` | mc-voice | [OpenAI Platform](https://platform.openai.com/api-keys) |
| `anthropicToken` | OpenClaw runtime | [Anthropic Console](https://console.anthropic.com/) |
