import * as path from "node:path";
import * as os from "node:os";

const STATE_DIR = process.env.OPENCLAW_STATE_DIR ?? path.join(os.homedir(), ".openclaw");

export interface SubstackPublication {
  subdomain: string;
  vaultKey: string;
}

export interface SubstackConfig {
  subdomain: string;
  vaultBin: string;
  publications?: Record<string, SubstackPublication>;
}

export function resolveConfig(raw: Record<string, unknown>): SubstackConfig {
  return {
    subdomain: (raw.subdomain as string) || "augmentedmike",
    vaultBin: (raw.vaultBin as string) || path.join(STATE_DIR, "miniclaw", "SYSTEM", "bin", "mc-vault"),
    publications: (raw.publications as Record<string, SubstackPublication>) || undefined,
  };
}
