/**
 * mc-soul — OpenClaw plugin
 *
 * Soul backup and restore. Snapshots all workspace files and openclaw.json
 * so the agent's identity, memory, and config can be versioned and recovered.
 *
 * Commands:
 *   mc soul backup [name]   — create a named snapshot
 *   mc soul restore <name>  — restore a snapshot
 *   mc soul list            — list available snapshots
 *   mc soul diff <name>     — diff snapshot vs current
 *   mc soul delete <name>   — delete a snapshot
 *
 * State dir resolution (in priority order):
 *   1. SDK service context stateDir (authoritative — same source openclaw itself uses)
 *   2. MINICLAW_STATE_DIR env var (with OPENCLAW_STATE_DIR fallback)
 *   3. stateDir from plugin config
 *   4. ~/.openclaw (fallback)
 */

import type { OpenClawPluginApi } from "openclaw/plugin-sdk";
import { registerSoulCommands } from "./cli/commands.js";
import { resolveStateDir } from "./src/soul.js";

interface SoulConfig {
  stateDir?: string;
}

export default function register(api: OpenClawPluginApi): void {
  const raw = (api.pluginConfig ?? {}) as SoulConfig;

  // Start with env var / config resolution. The service start() below will
  // override this with the authoritative SDK-provided stateDir when running
  // inside the gateway. For CLI-only invocations the service never fires, so
  // the env var / config path is the best we can do.
  let stateDir = resolveStateDir(raw.stateDir);

  api.registerService({
    id: "mc-soul",
    start(ctx) {
      // ctx.stateDir is provided by the openclaw runtime — this is the same
      // value openclaw itself uses, derived from MINICLAW_STATE_DIR/OPENCLAW_STATE_DIR or default.
      stateDir = ctx.stateDir;
      api.logger.info(`mc-soul loaded (stateDir=${stateDir})`);
    },
  });

  api.registerCli((ctx) => {
    // Note: for CLI invocations without a running gateway, registerService.start
    // has not fired yet, so stateDir is the env-var/config resolution.
    // For gateway CLI (openclaw soul list while gateway is up), this still runs
    // in a fresh process so we rely on env var / config.
    registerSoulCommands({
      program: ctx.program,
      stateDir,
      logger: ctx.logger,
    });
  });
}
