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

The installer reads the JSON, provisions the listed plugins, and stores
credentials in the local vault. Plugins not listed in the `plugins` array are
skipped.

## Customizing

You can mix and match plugins from any profile. The `plugins` array accepts any
plugin ID from `MANIFEST.json`. To see all available plugins:

```bash
cat MANIFEST.json | jq '[.plugins[].id]'
```

Add a plugin by appending its ID to the `plugins` array, and add any required
credentials (check the plugin's `requires` field in `MANIFEST.json`).

## Credential Reference

| Credential | Used by | Where to get it |
|------------|---------|----------------|
| `ghToken` | mc-board, mc-github | [GitHub Settings → Tokens](https://github.com/settings/tokens) |
| `emailAddress` + `appPassword` | mc-email | Your email provider's app password settings |
| `geminiKey` | mc-designer | [Google AI Studio](https://aistudio.google.com/apikey) |
| `openaiApiKey` | mc-voice | [OpenAI Platform](https://platform.openai.com/api-keys) |
| `anthropicToken` | OpenClaw runtime | [Anthropic Console](https://console.anthropic.com/) |
