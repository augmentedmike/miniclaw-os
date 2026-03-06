/**
 * mc-rolodex — Contact browser plugin for MiniClaw
 *
 * Fast, searchable access to trusted contacts.
 * Search by name, email, phone, domain, or tag.
 */

import * as path from 'node:path';
import * as os from 'node:os';
import type { OpenClawPluginApi } from 'openclaw/plugin-sdk';
import { SearchEngine } from './src/search/engine.js';
import { registerRolodexCommands } from './src/cli/commands.js';

export * from './src/search/types.js';
export * from './src/search/engine.js';
export * from './src/tui/browser.js';

export { SearchEngine } from './src/search/engine.js';
export { ContactBrowser } from './src/tui/browser.js';

// ---- Config ----

interface RolodexConfig {
  storagePath: string;
}

function resolvePath(p: string): string {
  if (p.startsWith('~/')) return path.join(os.homedir(), p.slice(2));
  return p;
}

function resolveConfig(api: OpenClawPluginApi): RolodexConfig {
  const raw = (api.pluginConfig ?? {}) as Partial<RolodexConfig>;
  return {
    storagePath: resolvePath(
      raw.storagePath ?? `~/am/user/augmentedmike_bot/rolodex/contacts.json`,
    ),
  };
}

// ---- Plugin entry point ----

export default function register(api: OpenClawPluginApi): void {
  const cfg = resolveConfig(api);
  api.logger.info(`mc-rolodex loading (storagePath=${cfg.storagePath})`);

  const engine = new SearchEngine(cfg.storagePath);

  api.logger.info(`mc-rolodex loaded (${engine.getAll().length} contacts)`);

  // ---- CLI ----
  api.registerCli((ctx) => {
    registerRolodexCommands(
      { program: ctx.program, logger: api.logger },
      engine,
    );
  });
}
