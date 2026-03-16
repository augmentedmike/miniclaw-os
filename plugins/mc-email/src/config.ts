import * as path from "node:path";
import * as os from "node:os";
import * as fs from "node:fs";

const STATE_DIR = process.env.OPENCLAW_STATE_DIR ?? path.join(os.homedir(), ".openclaw");

export interface EmailConfig {
  vaultBin: string;
  emailAddress: string;
  isGmail: boolean;
  smtpHost: string;
  smtpPort: number;
  imapHost: string;
  imapPort: number;
}

function loadSetupState(): Record<string, unknown> {
  const p = path.join(STATE_DIR, "USER", "setup-state.json");
  try { return JSON.parse(fs.readFileSync(p, "utf-8")); } catch { return {}; }
}

function isGmailAddress(email: string): boolean {
  return /@gmail\.com$/i.test(email) || /@googlemail\.com$/i.test(email);
}

export function resolveConfig(raw: Record<string, unknown>): EmailConfig {
  const setup = loadSetupState();
  const emailAddress = (raw.emailAddress as string) || (setup.emailAddress as string) || "";
  const gmail = isGmailAddress(emailAddress);

  // If Gmail: use Google servers. Otherwise: read from setup-state or plugin config.
  const smtpHost = (raw.smtpHost as string) || (setup.emailSmtpHost as string) || (gmail ? "smtp.gmail.com" : "");
  const smtpPort = Number((raw.smtpPort as string) || (setup.emailSmtpPort as string) || (gmail ? "587" : "465"));
  const imapHost = (raw.imapHost as string) || (gmail ? "imap.gmail.com" : smtpHost.replace(/^smtp\./, "mail."));
  const imapPort = Number((raw.imapPort as string) || "993");

  return {
    vaultBin: (raw.vaultBin as string) || path.join(STATE_DIR, "miniclaw", "SYSTEM", "bin", "mc-vault"),
    emailAddress,
    isGmail: gmail,
    smtpHost,
    smtpPort,
    imapHost,
    imapPort,
  };
}
