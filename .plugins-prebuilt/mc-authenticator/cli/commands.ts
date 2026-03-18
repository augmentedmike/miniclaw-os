import type { Command } from "commander";
import type { Logger } from "openclaw/plugin-sdk";
import type { AuthenticatorConfig } from "../src/config.js";
import { generateTOTP, parseOtpauthUri, timeRemaining } from "../src/totp.js";
import {
  getTOTPEntry,
  saveTOTPEntry,
  removeTOTPEntry,
  listTOTPEntries,
} from "../src/vault.js";
import type { TOTPEntry } from "../src/vault.js";

interface Ctx {
  program: Command;
  cfg: AuthenticatorConfig;
  logger: Logger;
}

export function registerAuthCommands(ctx: Ctx): void {
  const { program, cfg } = ctx;

  const sub = program
    .command("mc-auth")
    .description("TOTP authenticator — generate 2FA codes from stored secrets");

  // ---- add (raw base32 secret) ----
  sub
    .command("add <name> <secret>")
    .description("Store a TOTP secret (raw base32 string)")
    .option("--issuer <issuer>", "Service issuer name")
    .option("--account <account>", "Account identifier")
    .option("--algorithm <alg>", "Hash algorithm (sha1, sha256, sha512)", "sha1")
    .option("--digits <n>", "Code length (6 or 8)", "6")
    .option("--period <n>", "Time period in seconds", "30")
    .action((name: string, secret: string, opts: {
      issuer?: string; account?: string; algorithm: string; digits: string; period: string;
    }) => {
      const entry: TOTPEntry = {
        secret: secret.toUpperCase().replace(/\s+/g, ""),
        issuer: opts.issuer ?? "",
        account: opts.account ?? "",
        algorithm: opts.algorithm,
        digits: parseInt(opts.digits, 10),
        period: parseInt(opts.period, 10),
      };
      saveTOTPEntry(cfg.vaultBin, name, entry);
      console.log(`Saved TOTP secret for "${name}".`);
    });

  // ---- add-uri (otpauth:// URI) ----
  sub
    .command("add-uri <name> <uri>")
    .description("Store from otpauth:// URI (preserves issuer, algorithm, digits, period)")
    .action((name: string, uri: string) => {
      const params = parseOtpauthUri(uri);
      const entry: TOTPEntry = {
        secret: params.secret,
        issuer: params.issuer,
        account: params.account,
        algorithm: params.algorithm,
        digits: params.digits,
        period: params.period,
      };
      saveTOTPEntry(cfg.vaultBin, name, entry);
      console.log(`Saved TOTP secret for "${name}" (${params.issuer || "unknown issuer"}).`);
    });

  // ---- code ----
  sub
    .command("code <name>")
    .description("Print current TOTP code + seconds remaining")
    .action((name: string) => {
      const entry = getTOTPEntry(cfg.vaultBin, name);
      if (!entry) {
        console.error(`No TOTP secret found for "${name}".`);
        process.exit(1);
      }
      const code = generateTOTP(entry.secret, {
        algorithm: entry.algorithm,
        digits: entry.digits,
        period: entry.period,
      });
      const remaining = timeRemaining(entry.period);
      console.log(`${code} (expires in ${remaining}s)`);
    });

  // ---- verify ----
  sub
    .command("verify <name> <code>")
    .description("Check if a code is valid (current +/- 1 window for clock drift)")
    .action((name: string, code: string) => {
      const entry = getTOTPEntry(cfg.vaultBin, name);
      if (!entry) {
        console.error(`No TOTP secret found for "${name}".`);
        process.exit(1);
      }
      const now = Date.now();
      const periodMs = entry.period * 1000;
      const windows = [now - periodMs, now, now + periodMs];
      const valid = windows.some((ts) =>
        generateTOTP(entry.secret, {
          algorithm: entry.algorithm,
          digits: entry.digits,
          period: entry.period,
          timestamp: ts,
        }) === code,
      );
      if (valid) {
        console.log("Valid \u2713");
      } else {
        console.log("Invalid \u2717");
        process.exit(1);
      }
    });

  // ---- list ----
  sub
    .command("list")
    .description("List all stored TOTP services")
    .action(() => {
      const names = listTOTPEntries(cfg.vaultBin);
      if (names.length === 0) {
        console.log("No TOTP services stored.");
        return;
      }
      for (const name of names) {
        const entry = getTOTPEntry(cfg.vaultBin, name);
        if (!entry) continue;
        const accountSuffix = entry.account ? " (" + entry.account + ")" : "";
        const label = entry.issuer
          ? entry.issuer + accountSuffix
          : entry.account || "(no label)";
        const alg = entry.algorithm.toUpperCase();
        console.log(`  ${name.padEnd(12)} \u2014 ${label}   ${alg}/${entry.digits}/${entry.period}s`);
      }
    });

  // ---- remove ----
  sub
    .command("remove <name>")
    .description("Remove a TOTP service from vault")
    .action((name: string) => {
      const entry = getTOTPEntry(cfg.vaultBin, name);
      if (!entry) {
        console.error(`No TOTP secret found for "${name}".`);
        process.exit(1);
      }
      removeTOTPEntry(cfg.vaultBin, name);
      console.log(`Removed TOTP secret for "${name}".`);
    });
}
