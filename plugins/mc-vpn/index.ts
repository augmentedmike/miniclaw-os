import * as path from "node:path";
import * as os from "node:os";
import type { OpenClawPluginApi } from "openclaw/plugin-sdk";
import { registerVpnCommands } from "./cli/commands.js";
import { createVpnTools } from "./tools/definitions.js";

export interface VpnConfig {
  mullvadBin: string;
  stateDir: string;
  defaultCountry: string | null;
}

function resolvePath(p: string): string {
  if (p.startsWith("~/")) return path.join(os.homedir(), p.slice(2));
  return p;
}

function findMullvadBinary(): string | null {
  const fs = require("node:fs");
  const candidates = [
    "/usr/bin/mullvad",
    "/usr/local/bin/mullvad",
    "/opt/homebrew/bin/mullvad",
    "/opt/local/bin/mullvad", // MacPorts
  ];
  
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }
  return null;
}

function resolveConfig(api: OpenClawPluginApi): VpnConfig {
  const raw = (api.pluginConfig ?? {}) as Partial<VpnConfig>;
  const openclawStateDir = resolvePath(
    process.env.OPENCLAW_STATE_DIR ?? "~/.openclaw",
  );
  
  const mullvadBin = raw.mullvadBin ?? findMullvadBinary() ?? "/usr/bin/mullvad";
  
  return {
    mullvadBin,
    stateDir: resolvePath(raw.stateDir ?? path.join(openclawStateDir, ".vpn")),
    defaultCountry: raw.defaultCountry ?? null,
  };
}

export default function register(api: OpenClawPluginApi): void {
  const cfg = resolveConfig(api);
  api.logger.info(`mc-vpn loading (bin=${cfg.mullvadBin}, stateDir=${cfg.stateDir})`);

  api.registerCli((ctx) => {
    registerVpnCommands(
      { program: ctx.program, logger: api.logger },
      cfg,
    );
  });

  for (const tool of createVpnTools(cfg, api.logger)) {
    api.registerTool(tool);
  }

  api.logger.info("mc-vpn loaded");
}
