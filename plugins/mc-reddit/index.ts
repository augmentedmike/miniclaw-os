import type { OpenClawPluginApi } from "openclaw/plugin-sdk";
import { getCookies } from "./src/vault.js";
import { registerRedditCommands } from "./cli/commands.js";

export default function register(api: OpenClawPluginApi): void {
  const vaultBin = `${process.env.HOME}/am/miniclaw/SYSTEM/bin/miniclaw-vault`;
  const hasCookies = !!getCookies(vaultBin);

  if (hasCookies) {
    api.logger.info("mc-reddit loaded — cookies found in vault");
  } else {
    api.logger.warn("mc-reddit: no cookies in vault. Run: mc mc-reddit auth --cookies '<cookie string>'");
  }

  api.registerCli((ctx) => {
    registerRedditCommands({ program: ctx.program, vaultBin, logger: api.logger });
  });
}
