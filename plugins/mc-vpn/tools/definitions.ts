import * as fs from "node:fs";
import { execFileSync } from "node:child_process";
import type { AnyAgentTool } from "openclaw/plugin-sdk";
import type { Logger } from "pino";
import type { VpnConfig } from "../index.js";

function schema(
  props: Record<string, unknown>,
  required?: string[],
): unknown {
  return {
    type: "object",
    properties: props,
    required: required ?? [],
    additionalProperties: false,
  };
}

function ok(text: string) {
  return {
    content: [{ type: "text" as const, text: text.trim() }],
    details: {},
  };
}

function toolErr(text: string) {
  return {
    content: [{ type: "text" as const, text: text.trim() }],
    isError: true,
    details: {},
  };
}

function runSafe(bin: string, args: string[], timeout = 15_000): string | null {
  try {
    return execFileSync(bin, args, { timeout, encoding: "utf-8" }).trim();
  } catch {
    return null;
  }
}

function run(bin: string, args: string[], timeout = 15_000): string {
  try {
    return execFileSync(bin, args, { timeout, encoding: "utf-8" }).trim();
  } catch (e: unknown) {
    const msg = e instanceof Error ? (e as any).stderr?.toString().trim() || e.message : String(e);
    throw new Error(msg);
  }
}

export function createVpnTools(
  cfg: VpnConfig,
  logger: Logger,
): AnyAgentTool[] {
  return [
    {
      name: "vpn_status",
      label: "VPN Status",
      description:
        "Get current VPN connection state, relay location, country, and IP address.",
      parameters: schema({}) as never,
      execute: async () => {
        logger.info("mc-vpn/tool status: running");
        try {
          if (!fs.existsSync(cfg.mullvadBin)) {
            return toolErr(`Mullvad binary not found at ${cfg.mullvadBin}`);
          }

          const statusJson = runSafe(cfg.mullvadBin, ["status", "--json"]);
          if (!statusJson) {
            return toolErr("Could not get VPN status. Is Mullvad running?");
          }

          const parsed = JSON.parse(statusJson);
          const state = parsed.state ?? "unknown";
          const isConnected = /^connected$/i.test(state);
          const loc = parsed.details?.location;
          const relay = parsed.details?.relay;

          const lines = [
            `State: ${state}`,
            ...(isConnected
              ? [
                  `Relay: ${relay?.hostname ?? loc?.hostname ?? "N/A"}`,
                  `Country: ${loc?.country ?? "N/A"}`,
                  `City: ${loc?.city ?? "N/A"}`,
                  `Tunnel IP: ${loc?.ipv4 ?? "N/A"}`,
                ]
              : [
                  `Country: ${loc?.country ?? "N/A"}`,
                  `City: ${loc?.city ?? "N/A"}`,
                  `Visible IP: ${loc?.ipv4 ?? "N/A"}`,
                ]),
          ];

          return ok(lines.join("\n"));
        } catch (e: unknown) {
          const msg = e instanceof Error ? e.message : String(e);
          logger.error(`mc-vpn/tool status error: ${msg}`);
          return toolErr(`vpn_status failed: ${msg}`);
        }
      },
    },
    {
      name: "vpn_connect",
      label: "VPN Connect",
      description:
        "Connect to Mullvad VPN. Optionally specify a country code to set relay location first.",
      parameters: schema(
        {
          country: {
            type: "string",
            description: "Country code for relay location (e.g., 'us', 'de', 'fr'). Optional.",
          },
        },
        [],
      ) as never,
      execute: async (args: { country?: string }) => {
        logger.info("mc-vpn/tool connect: running", { country: args.country });
        try {
          if (!fs.existsSync(cfg.mullvadBin)) {
            return toolErr(`Mullvad binary not found at ${cfg.mullvadBin}`);
          }

          if (args.country) {
            try {
              run(cfg.mullvadBin, ["relay", "set", "location", args.country]);
            } catch (e) {
              return toolErr(`Failed to set relay location to ${args.country}: ${e instanceof Error ? e.message : String(e)}`);
            }
          }

          run(cfg.mullvadBin, ["connect"]);
          return ok("Connected to Mullvad VPN");
        } catch (e: unknown) {
          const msg = e instanceof Error ? e.message : String(e);
          logger.error(`mc-vpn/tool connect error: ${msg}`);
          return toolErr(`vpn_connect failed: ${msg}`);
        }
      },
    },
    {
      name: "vpn_disconnect",
      label: "VPN Disconnect",
      description: "Disconnect from Mullvad VPN.",
      parameters: schema({}) as never,
      execute: async () => {
        logger.info("mc-vpn/tool disconnect: running");
        try {
          if (!fs.existsSync(cfg.mullvadBin)) {
            return toolErr(`Mullvad binary not found at ${cfg.mullvadBin}`);
          }

          run(cfg.mullvadBin, ["disconnect"]);
          return ok("Disconnected from Mullvad VPN");
        } catch (e: unknown) {
          const msg = e instanceof Error ? e.message : String(e);
          logger.error(`mc-vpn/tool disconnect error: ${msg}`);
          return toolErr(`vpn_disconnect failed: ${msg}`);
        }
      },
    },
    {
      name: "vpn_switch_country",
      label: "VPN Switch Country",
      description:
        "Switch VPN relay location to a different country and reconnect.",
      parameters: schema(
        {
          country: {
            type: "string",
            description: "Country code for the new relay location (e.g., 'us', 'de', 'fr')",
          },
        },
        ["country"],
      ) as never,
      execute: async (args: { country: string }) => {
        logger.info("mc-vpn/tool switch_country: running", { country: args.country });
        try {
          if (!fs.existsSync(cfg.mullvadBin)) {
            return toolErr(`Mullvad binary not found at ${cfg.mullvadBin}`);
          }

          run(cfg.mullvadBin, ["relay", "set", "location", args.country]);
          run(cfg.mullvadBin, ["reconnect"]);
          return ok(`Switched to ${args.country} and reconnected`);
        } catch (e: unknown) {
          const msg = e instanceof Error ? e.message : String(e);
          logger.error(`mc-vpn/tool switch_country error: ${msg}`);
          return toolErr(`vpn_switch_country failed: ${msg}`);
        }
      },
    },
  ];
}
