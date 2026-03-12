import * as path from "node:path";
import * as os from "node:os";

const STATE_DIR = process.env.OPENCLAW_STATE_DIR ?? path.join(os.homedir(), ".openclaw");

export interface SquareConfig {
  vaultBin: string;
  environment: "sandbox" | "production";
  locationId: string;
  currency: string;
}

export function resolveConfig(raw: Record<string, unknown>): SquareConfig {
  return {
    vaultBin: (raw.vaultBin as string) || path.join(STATE_DIR, "miniclaw", "SYSTEM", "bin", "mc-vault"),
    environment: (raw.environment as "sandbox" | "production") || "sandbox",
    locationId: (raw.locationId as string) || "",
    currency: (raw.currency as string) || "USD",
  };
}
