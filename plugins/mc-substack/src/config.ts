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
    vaultBin: (raw.vaultBin as string) || `${process.env.HOME}/am/miniclaw/SYSTEM/bin/miniclaw-vault`,
    publications: (raw.publications as Record<string, SubstackPublication>) || undefined,
  };
}
