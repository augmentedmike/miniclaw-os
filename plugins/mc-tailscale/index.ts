import * as path from "node:path";
import * as os from "node:os";
import type { OpenClawPluginApi } from "openclaw/plugin-sdk";
import { registerTailscaleCommands } from "./cli/commands.js";
import { createTailscaleTools } from "./tools/definitions.js";

export interface TailscaleConfig {
  tailscaleBin: string;
  tailnetName: string;
  apiTokenVaultKey: string;
  stateDir: string;
}

function resolvePath(p: string): string {
  if (p.startsWith("~/")) return path.join(os.homedir(), p.slice(2));
  return p;
}

function resolveConfig(api: OpenClawPluginApi): TailscaleConfig {
  const raw = (api.pluginConfig ?? {}) as Partial<TailscaleConfig>;
  const openclawStateDir = resolvePath(
    process.env.OPENCLAW_STATE_DIR ?? "~/.openclaw",
  );
  return {
    tailscaleBin: raw.tailscaleBin ?? "/opt/homebrew/bin/tailscale",
    tailnetName: raw.tailnetName ?? "",
    apiTokenVaultKey: raw.apiTokenVaultKey ?? "tailscale-api-token",
    stateDir: resolvePath(raw.stateDir ?? path.join(openclawStateDir, ".tailscale")),
  };
}

export default function register(api: OpenClawPluginApi): void {
  const cfg = resolveConfig(api);
  api.logger.info(`mc-tailscale loading (bin=${cfg.tailscaleBin}, stateDir=${cfg.stateDir})`);

  api.registerCli((ctx) => {
    registerTailscaleCommands(
      { program: ctx.program, logger: api.logger },
      cfg,
    );
  });

  for (const tool of createTailscaleTools(cfg, api.logger)) {
    api.registerTool(tool);
  }

  api.logger.info("mc-tailscale loaded");
}
