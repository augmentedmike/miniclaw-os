import type { AnyAgentTool } from "openclaw/plugin-sdk";
import type { AuthenticatorConfig } from "../src/config.js";
import { generateTOTP, timeRemaining } from "../src/totp.js";
import { getTOTPEntry, listTOTPEntries } from "../src/vault.js";

function schema(props: Record<string, unknown>, required?: string[]): unknown {
  return {
    type: "object",
    properties: props,
    required: required ?? [],
    additionalProperties: false,
  };
}

function str(description: string): unknown {
  return { type: "string", description };
}

function ok(text: string) {
  return { content: [{ type: "text" as const, text: text.trim() }], details: {} };
}

function err(text: string) {
  return {
    content: [{ type: "text" as const, text: text.trim() }],
    isError: true,
    details: {},
  };
}

export function createAuthTools(cfg: AuthenticatorConfig): AnyAgentTool[] {
  return [
    {
      name: "auth_code",
      label: "Auth Code",
      description:
        "Get the current TOTP 2FA code for a service. Returns the 6-digit code and seconds until expiry.",
      parameters: schema(
        { service: str("Service name (e.g. github, aws, google)") },
        ["service"],
      ) as never,
      execute: async (_id: unknown, params: Record<string, unknown>) => {
        try {
          const name = params.service as string;
          const entry = getTOTPEntry(cfg.vaultBin, name);
          if (!entry) return err(`No TOTP secret found for "${name}".`);

          const code = generateTOTP(entry.secret, {
            algorithm: entry.algorithm,
            digits: entry.digits,
            period: entry.period,
          });
          const remaining = timeRemaining(entry.period);
          const accountSuffix = entry.account ? " (" + entry.account + ")" : "";
          const label = entry.issuer
            ? entry.issuer + accountSuffix
            : name;

          return ok(`Code: ${code}\nExpires in: ${remaining}s\nService: ${label}`);
        } catch (e: unknown) {
          return err(`Failed to generate TOTP code: ${(e as Error).message}`);
        }
      },
    },

    {
      name: "auth_list",
      label: "Auth List",
      description: "List all stored TOTP services with issuer and account info.",
      parameters: schema({}) as never,
      execute: async () => {
        try {
          const names = listTOTPEntries(cfg.vaultBin);
          if (names.length === 0) return ok("No TOTP services stored.");

          const lines = names.map((name) => {
            const entry = getTOTPEntry(cfg.vaultBin, name);
            if (!entry) return name;
            const acctSuffix = entry.account ? " (" + entry.account + ")" : "";
            const label = entry.issuer
              ? entry.issuer + acctSuffix
              : entry.account || "(no label)";
            return `${name} \u2014 ${label}`;
          });
          return ok(lines.join("\n"));
        } catch (e: unknown) {
          return err(`Failed to list TOTP services: ${(e as Error).message}`);
        }
      },
    },

    {
      name: "auth_time_remaining",
      label: "Auth Time Remaining",
      description:
        "Seconds until the current TOTP code expires. Useful to decide whether to use the current code or wait.",
      parameters: schema(
        { service: str("Service name (e.g. github, aws, google)") },
        ["service"],
      ) as never,
      execute: async (_id: unknown, params: Record<string, unknown>) => {
        try {
          const name = params.service as string;
          const entry = getTOTPEntry(cfg.vaultBin, name);
          if (!entry) return err(`No TOTP secret found for "${name}".`);

          const remaining = timeRemaining(entry.period);
          return ok(`${remaining} seconds remaining`);
        } catch (e: unknown) {
          return err(`Failed to check time remaining: ${(e as Error).message}`);
        }
      },
    },
  ];
}
