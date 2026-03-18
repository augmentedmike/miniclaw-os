import * as path from "node:path";
import * as os from "node:os";

export type MoltbookConfig = {
  apiUrl: string;
  vaultBin: string;
};

export function resolveConfig(raw: Record<string, unknown>): MoltbookConfig {
  return {
    apiUrl: (raw["apiUrl"] as string | undefined) ?? "https://api.moltbook.com",
    vaultBin: (raw["vaultBin"] as string | undefined) ?? path.join(os.homedir(), ".local", "bin", "mc-vault"),
  };
}
