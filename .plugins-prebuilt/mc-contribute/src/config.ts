export interface ContributeConfig {
  upstreamRepo: string;
  forkRemote: string;
}

export function resolveConfig(raw: Record<string, unknown>): ContributeConfig {
  return {
    upstreamRepo: (raw.upstreamRepo as string) || "augmentedmike/miniclaw-os",
    forkRemote: (raw.forkRemote as string) || "origin",
  };
}
