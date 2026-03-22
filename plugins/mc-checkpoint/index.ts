import * as path from "node:path";
import * as os from "node:os";
import type { OpenClawPluginApi } from "openclaw/plugin-sdk";
import { registerCheckpointCommands } from "./cli/commands.js";
import { createCheckpointTools } from "./tools/definitions.js";

export interface CheckpointConfig {
  defaultMaxAgeDays: number;
  autoRepos: string[];
}

function resolvePath(p: string): string {
  if (p.startsWith("~/")) return path.join(os.homedir(), p.slice(2));
  return p;
}

function resolveConfig(api: OpenClawPluginApi): CheckpointConfig {
  const raw = (api.pluginConfig ?? {}) as Partial<CheckpointConfig>;
  return {
    defaultMaxAgeDays: raw.defaultMaxAgeDays ?? 30,
    autoRepos: (raw.autoRepos ?? []).map(resolvePath),
  };
}

export default function register(api: OpenClawPluginApi): void {
  const cfg = resolveConfig(api);
  api.logger.info(
    `mc-checkpoint loading (defaultMaxAge=${cfg.defaultMaxAgeDays}d, autoRepos=${cfg.autoRepos.length})`,
  );

  api.registerCli((ctx) => {
    registerCheckpointCommands(
      { program: ctx.program, logger: api.logger },
      { defaultMaxAgeDays: cfg.defaultMaxAgeDays },
    );
  });

  for (const tool of createCheckpointTools(api.logger)) {
    api.registerTool(tool);
  }

  api.logger.info("mc-checkpoint loaded");
}
