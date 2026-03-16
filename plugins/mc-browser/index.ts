import * as path from "node:path";
import * as os from "node:os";
import type { OpenClawPluginApi } from "openclaw/plugin-sdk";
import { registerBrowserCommands } from "./cli/commands.js";

export interface BrowserConfig {
  cdpPort: number;
  extensionIds: string[];
  stateDir: string;
}

function resolvePath(p: string): string {
  if (p.startsWith("~/")) return path.join(os.homedir(), p.slice(2));
  return p;
}

function resolveConfig(api: OpenClawPluginApi): BrowserConfig {
  const raw = (api.pluginConfig ?? {}) as Partial<BrowserConfig>;
  const stateDir = resolvePath(
    process.env.OPENCLAW_STATE_DIR ?? "~/.openclaw",
  );
  return {
    stateDir,
    cdpPort: raw.cdpPort ?? 9222,
    extensionIds: raw.extensionIds ?? [
      "fcoeoabgfenejglbffodgkkbkcdhcgfn", // Claude extension
    ],
  };
}

export default function register(api: OpenClawPluginApi): void {
  const cfg = resolveConfig(api);
  api.logger.info(
    `mc-browser loading (cdpPort=${cfg.cdpPort})`,
  );

  api.registerCli((ctx) => {
    registerBrowserCommands(
      { program: ctx.program, logger: api.logger },
      cfg,
    );
  });

  api.logger.info("mc-browser loaded");
}
