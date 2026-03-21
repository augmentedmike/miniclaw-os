import type { OpenClawPluginApi } from "openclaw/plugin-sdk";
import { resolveConfig } from "./src/config.js";
import { registerRealtyCommands } from "./cli/commands.js";
import { createRealtyTools } from "./tools/definitions.js";

export default function register(api: OpenClawPluginApi): void {
  const cfg = resolveConfig((api.pluginConfig ?? {}) as Record<string, unknown>);

  api.logger.info(`mc-realty loaded (market=${cfg.defaultMarket || "any"}, radius=${cfg.compRadiusMiles}mi)`);

  if (typeof api.hook === "function") api.hook("before_prompt_build", (_ctx) => {
    return {
      prepend:
        `## Real Estate Context\n` +
        `You are a real estate assistant helping with FSBO (For Sale By Owner) and brokerage workflows.\n` +
        `Available commands: list-property, comp-analysis, schedule-showing, generate-listing, track-transaction, market-report.\n` +
        `For pricing, always use comp-analysis with real ATTOM Data API comps — never estimate prices from training data.\n` +
        `Transaction stages: ${cfg.transactionStages.join(" → ")}.\n` +
        `Default market: ${cfg.defaultMarket || "(not set — ask the user)"}.\n` +
        `Syndication platforms: ${cfg.syndicatePlatforms.join(", ")}.\n`,
    };
  });

  api.registerCli((ctx) => {
    registerRealtyCommands({ program: ctx.program, cfg, logger: api.logger });
  });

  for (const tool of createRealtyTools(cfg)) {
    api.registerTool(tool);
  }
}
