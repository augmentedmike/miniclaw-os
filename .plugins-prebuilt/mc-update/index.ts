import * as path from "node:path";
import * as os from "node:os";
import * as fs from "node:fs";
import type { OpenClawPluginApi } from "openclaw/plugin-sdk";
import { registerUpdateCommands } from "./cli/commands.js";
import { createUpdateTools } from "./tools/definitions.js";
import type { UpdateConfig, RepoConfig } from "./src/types.js";

function resolvePath(p: string): string {
  if (p.startsWith("~/")) return path.join(os.homedir(), p.slice(2));
  return p;
}

function discoverPlugins(pluginsDir: string): RepoConfig[] {
  if (!fs.existsSync(pluginsDir)) return [];
  const repos: RepoConfig[] = [];
  for (const entry of fs.readdirSync(pluginsDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const pluginPath = path.join(pluginsDir, entry.name);
    const gitDir = path.join(pluginPath, ".git");
    // Only include plugins that are separate git repos
    if (fs.existsSync(gitDir)) {
      repos.push({ name: entry.name, path: pluginPath, remote: "origin", stableTag: "stable" });
    }
  }
  return repos;
}

function resolveConfig(api: OpenClawPluginApi): UpdateConfig {
  const raw = (api.pluginConfig ?? {}) as Record<string, unknown>;
  const stateDir = resolvePath(process.env.OPENCLAW_STATE_DIR ?? "~/.openclaw");
  const pluginDir = path.join(stateDir, "miniclaw", "plugins", "mc-update");

  // Default repos: miniclaw-os and openclaw fork
  const defaultRepos: RepoConfig[] = [
    {
      name: "miniclaw-os",
      path: path.join(stateDir, "projects", "miniclaw-os"),
      remote: "origin",
      stableTag: "stable",
    },
    {
      name: "openclaw",
      path: path.join(stateDir, "projects", "openclaw"),
      remote: "origin",
      stableTag: "stable",
    },
  ];

  // Discover plugin repos
  const pluginRepos = discoverPlugins(path.join(stateDir, "miniclaw", "plugins"));

  const configRepos = raw.repos as RepoConfig[] | undefined;
  const repos = configRepos ?? [...defaultRepos, ...pluginRepos];

  return {
    stateDir,
    pluginDir,
    updateTime: (raw.updateTime as string) ?? "0 3 * * *",
    autoRollback: (raw.autoRollback as boolean) ?? true,
    notifyOnUpdate: (raw.notifyOnUpdate as boolean) ?? true,
    smokeTimeout: (raw.smokeTimeout as number) ?? 60_000,
    repos: repos.map((r) => ({ ...r, path: resolvePath(r.path) })),
  };
}

export default function register(api: OpenClawPluginApi): void {
  const cfg = resolveConfig(api);
  api.logger.info(
    `mc-update loading (stateDir=${cfg.stateDir}, repos=${cfg.repos.length}, schedule=${cfg.updateTime})`,
  );

  api.registerCli((ctx) => {
    registerUpdateCommands({ program: ctx.program, logger: api.logger }, cfg);
  });

  for (const tool of createUpdateTools(cfg, api.logger)) {
    api.registerTool(tool);
  }

  // Register cron job at configured updateTime
  if (api.registerCron) {
    api.registerCron({
      id: "mc-update-nightly",
      schedule: cfg.updateTime,
      description: "Nightly self-update check and apply",
      handler: async () => {
        api.logger.info("mc-update cron: starting scheduled update");
        const { runFullUpdate } = await import("./src/orchestrator.js");
        const result = await runFullUpdate(cfg, api.logger);
        api.logger.info(`mc-update cron: finished with result=${result}`);
      },
    });
  }

  api.logger.info("mc-update loaded");
}
