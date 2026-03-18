import * as path from "node:path";
import * as os from "node:os";
import type { OpenClawPluginApi } from "openclaw/plugin-sdk";
import { getCookies } from "./src/vault.js";
import { registerRedditCommands } from "./cli/commands.js";

const STATE_DIR = process.env.OPENCLAW_STATE_DIR ?? path.join(os.homedir(), ".openclaw");

export default function register(api: OpenClawPluginApi): void {
  const vaultBin = path.join(STATE_DIR, "miniclaw", "SYSTEM", "bin", "mc-vault");
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
