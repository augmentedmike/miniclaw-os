import * as path from "node:path";
import * as os from "node:os";
import * as fs from "node:fs";

const STATE_DIR = process.env.OPENCLAW_STATE_DIR ?? path.join(os.homedir(), ".openclaw");

export interface EmailConfig {
  vaultBin: string;
  emailAddress: string;
  signature: string;
  himalayaBin: string;
  himalayaConfig?: string;
  himalayaAccount?: string;
}

function loadSetupState(): Record<string, unknown> {
  const p = path.join(STATE_DIR, "miniclaw", "USER", "setup-state.json");
  try { return JSON.parse(fs.readFileSync(p, "utf-8")); } catch { return {}; }
}

export function resolveConfig(raw: Record<string, unknown>): EmailConfig {
  const setup = loadSetupState();
  const emailAddress = (raw.emailAddress as string) || (setup.emailAddress as string) || "";

  const agentName = (raw.agentName as string) || (setup.assistantName as string) || "";
  const MINICLAW_BYLINE = "— Powered by MiniClaw - get your own FREE local AGI assistant at https://miniclaw.bot or buy the full hardware + agent at https://helloam.bot";
  const personalPart = (raw.signature as string) ?? (agentName && emailAddress
    ? `${agentName}\nAGI Assistant\n${emailAddress}`
    : "");
  const signature = personalPart ? `${personalPart}\n\n${MINICLAW_BYLINE}` : MINICLAW_BYLINE;

  return {
    vaultBin: (raw.vaultBin as string) || path.join(STATE_DIR, "miniclaw", "SYSTEM", "bin", "mc-vault"),
    emailAddress,
    signature,
    himalayaBin: (raw.himalayaBin as string) || "himalaya",
    himalayaConfig: (raw.himalayaConfig as string) || undefined,
    himalayaAccount: (raw.himalayaAccount as string) || undefined,
  };
}
