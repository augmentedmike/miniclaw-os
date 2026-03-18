import * as path from "node:path";
import * as os from "node:os";

const STATE_DIR = process.env.OPENCLAW_STATE_DIR ?? path.join(os.homedir(), ".openclaw");

export interface StripeConfig {
  vaultBin: string;
  testMode: boolean;
}

export function resolveConfig(raw: Record<string, unknown>): StripeConfig {
  return {
    vaultBin: (raw.vaultBin as string) || path.join(STATE_DIR, "miniclaw", "SYSTEM", "bin", "mc-vault"),
    testMode: (raw.testMode as boolean) ?? false,
  };
}
