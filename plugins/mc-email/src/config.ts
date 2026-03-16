import * as path from "node:path";
import * as os from "node:os";
import { vaultGet } from "./vault.js";

const STATE_DIR = process.env.OPENCLAW_STATE_DIR ?? path.join(os.homedir(), ".openclaw");

export interface EmailConfig {
  vaultBin: string;
  emailAddress: string;
  smtpHost: string;
  smtpPort: number;
  imapHost: string;
  imapPort: number;
}

export function resolveConfig(raw: Record<string, unknown>): EmailConfig {
  const vaultBin = (raw.vaultBin as string) || path.join(STATE_DIR, "miniclaw", "SYSTEM", "bin", "mc-vault");

  const smtpHost = (raw.smtpHost as string) || vaultGet(vaultBin, "smtp-host") || "smtp.gmail.com";
  const smtpPortRaw = (raw.smtpPort as string) || vaultGet(vaultBin, "smtp-port") || "587";
  const imapHost = (raw.imapHost as string) || (smtpHost === "smtp.gmail.com" ? "imap.gmail.com" : smtpHost.replace(/^smtp\./, "imap."));
  const imapPort = (raw.imapPort as number) || 993;

  return {
    vaultBin,
    emailAddress: (raw.emailAddress as string) || "augmentedmike@gmail.com",
    smtpHost,
    smtpPort: parseInt(smtpPortRaw, 10),
    imapHost,
    imapPort,
  };
}
