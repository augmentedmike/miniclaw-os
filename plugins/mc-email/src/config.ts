import * as path from "node:path";
import * as os from "node:os";

const STATE_DIR = process.env.OPENCLAW_STATE_DIR ?? path.join(os.homedir(), ".openclaw");

export interface EmailConfig {
  vaultBin: string;
  emailAddress: string;
}

export function resolveConfig(raw: Record<string, unknown>): EmailConfig {
  return {
    vaultBin: (raw.vaultBin as string) || path.join(STATE_DIR, "miniclaw", "SYSTEM", "bin", "mc-vault"),
    emailAddress: (raw.emailAddress as string) || "augmentedmike@gmail.com",
  };
}
