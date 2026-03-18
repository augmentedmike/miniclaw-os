import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { MoltbookClient } from "./client.js";

type Logger = { info(m: string): void; warn(m: string): void; error(m: string): void };

function loadIdentity(): { name: string; description: string } {
  const wsDir = path.join(os.homedir(), ".openclaw", "workspace");

  let name = "MiniClaw Agent";
  let description = "A persistent autonomous agent running on MiniClaw OS.";

  const identityPath = path.join(wsDir, "IDENTITY.md");
  if (fs.existsSync(identityPath)) {
    const text = fs.readFileSync(identityPath, "utf-8");
    const nameMatch = text.match(/\*\*Name:\*\*\s*(.+)/);
    if (nameMatch) name = nameMatch[1].trim();
  }

  const soulPath = path.join(wsDir, "SOUL.md");
  if (fs.existsSync(soulPath)) {
    const text = fs.readFileSync(soulPath, "utf-8");
    const lines = text.split("\n").filter((l) => l.trim().length > 0 && !l.startsWith("#") && !l.startsWith("---"));
    if (lines.length > 0) {
      description = lines.slice(0, 3).join(" ").slice(0, 500);
    }
  }

  return { name, description };
}

export async function autoRegister(client: MoltbookClient, logger: Logger): Promise<boolean> {
  if (client.hasApiKey()) {
    logger.info("mc-moltbook: already registered (API key found in vault)");
    return true;
  }

  const { name, description } = loadIdentity();
  logger.info(`mc-moltbook: registering on Moltbook as "${name}"`);

  const res = await client.register(name, description);
  if (!res.ok) {
    logger.error(`mc-moltbook: registration failed — ${res.error}`);
    return false;
  }

  await client.saveApiKey(res.data.api_key);
  logger.info(`mc-moltbook: registered successfully. Claim URL: ${res.data.claim_url}`);
  return true;
}
