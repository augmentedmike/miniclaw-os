import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { spawnSync } from "node:child_process";

const CLAUDE_HOST = "https://api.anthropic.com";
const CLAUDE_MODEL = "claude-sonnet-4-6";

/**
 * Resolve the Anthropic API token.
 * Priority:
 *   1. ANTHROPIC_API_KEY env var (direct use / CI)
 *   2. OpenClaw auth-profiles.json (plugin context — the running OpenClaw session)
 */
function getApiToken(): string {
  const envKey = process.env.ANTHROPIC_API_KEY?.trim();
  if (envKey) return envKey;

  // Resolve from OpenClaw auth profiles (works when running inside the OpenClaw process)
  const home = os.homedir();
  const stateDirCandidates = [
    path.join(home, ".openclaw_original"),
    path.join(home, ".openclaw"),
  ];

  for (const stateDir of stateDirCandidates) {
    const profilesPath = path.join(stateDir, "agents", "main", "agent", "auth-profiles.json");
    if (!fs.existsSync(profilesPath)) continue;
    try {
      const store = JSON.parse(fs.readFileSync(profilesPath, "utf8")) as {
        profiles?: Record<string, { token?: string; key?: string }>;
      };
      const profiles = store.profiles ?? {};
      // Prefer anthropic:default, then anthropic:max-subscription, then any anthropic profile
      const order = [
        "anthropic:default",
        "anthropic:max-subscription",
        ...Object.keys(profiles).filter((k) => k.startsWith("anthropic:")),
      ];
      for (const id of order) {
        const p = profiles[id];
        if (p?.token) return p.token;
        if (p?.key) return p.key;
      }
    } catch {
      // corrupt file — try next candidate
    }
  }

  throw new Error(
    "No Anthropic token found. Set ANTHROPIC_API_KEY or configure OpenClaw auth profiles (anthropic:default).",
  );
}

/**
 * Send an image to Claude for text-only analysis.
 * Uses the same curl approach as the Gemini client to avoid fetch/https issues.
 */
export async function claudeInspect(imagePath: string, prompt: string): Promise<string> {
  const apiToken = getApiToken();
  const imageBuffer = fs.readFileSync(imagePath);
  const base64 = imageBuffer.toString("base64");

  // Detect media type from file extension
  const ext = path.extname(imagePath).toLowerCase();
  const mediaType = ext === ".jpg" || ext === ".jpeg" ? "image/jpeg" : "image/png";

  const body = {
    model: CLAUDE_MODEL,
    max_tokens: 1024,
    messages: [{
      role: "user",
      content: [
        {
          type: "image",
          source: { type: "base64", media_type: mediaType, data: base64 },
        },
        { type: "text", text: prompt },
      ],
    }],
  };

  const tmpFile = path.join(os.tmpdir(), `mc-slop-${Date.now()}.json`);
  fs.writeFileSync(tmpFile, JSON.stringify(body));

  const result = spawnSync("curl", [
    "-s",
    "-X", "POST",
    `${CLAUDE_HOST}/v1/messages`,
    "-H", "Content-Type: application/json",
    "-H", `x-api-key: ${apiToken}`,
    "-H", "anthropic-version: 2023-06-01",
    "-d", `@${tmpFile}`,
  ], { encoding: "utf8", maxBuffer: 20 * 1024 * 1024 });

  fs.unlinkSync(tmpFile);

  if (result.error) throw result.error;
  if (!result.stdout) throw new Error("Claude returned no output");

  const json = JSON.parse(result.stdout) as any;
  if (json.error) throw new Error(`Claude API error: ${JSON.stringify(json.error)}`);

  const text = json.content
    ?.filter((b: any) => b.type === "text")
    ?.map((b: any) => b.text as string)
    ?.join("\n") ?? "";

  if (!text) throw new Error("Claude returned no text content");
  return text;
}
