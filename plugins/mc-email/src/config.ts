export interface EmailConfig {
  vaultBin: string;
  emailAddress: string;
}

export function resolveConfig(raw: Record<string, unknown>): EmailConfig {
  return {
    vaultBin: (raw.vaultBin as string) || `${process.env.HOME}/am/miniclaw/SYSTEM/bin/miniclaw-vault`,
    emailAddress: (raw.emailAddress as string) || "augmentedmike@gmail.com",
  };
}
