import * as path from "node:path";
import * as os from "node:os";

export type ResearchConfig = {
  stateDir: string;
  perplexityModel: string;
  searchProvider: "serp" | "google" | "bing";
  maxSnapshotPages: number;
};

export function resolveConfig(raw: Record<string, unknown>): ResearchConfig {
  const defaultStateDir = path.join(os.homedir(), ".openclaw", "miniclaw", "USER", "research");

  return {
    stateDir: (raw["stateDir"] as string | undefined) ?? defaultStateDir,
    perplexityModel: (raw["perplexityModel"] as string | undefined) ?? "sonar",
    searchProvider: (raw["searchProvider"] as "serp" | "google" | "bing" | undefined) ?? "google",
    maxSnapshotPages: (raw["maxSnapshotPages"] as number | undefined) ?? 5,
  };
}
