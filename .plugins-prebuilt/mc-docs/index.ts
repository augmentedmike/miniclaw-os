/**
 * mc-docs — Document authoring and versioning plugin for MiniClaw
 */

import * as path from 'node:path';
import * as os from 'node:os';
import type { OpenClawPluginApi } from 'openclaw/plugin-sdk';
import { DocumentStore } from './src/storage/json-store.js';
import { cmdCreate } from './src/commands/create.js';
import { cmdShow } from './src/commands/show.js';
import { cmdList } from './src/commands/list.js';
import { cmdEdit } from './src/commands/edit.js';
import { cmdVersions } from './src/commands/versions.js';

export * from './src/schema/types.js';
export * from './src/storage/json-store.js';
export * from './src/commands/create.js';
export * from './src/commands/show.js';
export * from './src/commands/list.js';
export * from './src/commands/edit.js';
export * from './src/commands/versions.js';

interface DocsConfig {
  basePath?: string;
}

function resolveConfig(api: OpenClawPluginApi): DocsConfig {
  const raw = (api.pluginConfig ?? {}) as Record<string, unknown>;
  return {
    basePath: raw.basePath as string | undefined,
  };
}

export default function register(api: OpenClawPluginApi): void {
  const cfg = resolveConfig(api);
  api.logger.info('mc-docs loading');

  const store = new DocumentStore({ basePath: cfg.basePath });

  api.registerCli((ctx) => {
    const docs = ctx.program
      .command('mc-docs')
      .description('Document authoring and versioning');

    docs
      .command('create <name>')
      .description('Create a new document')
      .option('-a, --author <author>', 'Author name')
      .option('-t, --tags <tags...>', 'Tags')
      .option('-c, --card-id <cardId>', 'Link to a board card')
      .action((name: string, opts: { author?: string; tags?: string[]; cardId?: string }) => {
        cmdCreate(name, opts, store);
      });

    docs
      .command('show <id>')
      .description('Display document content')
      .option('-r, --raw', 'Output raw body only')
      .action((id: string, opts: { raw?: boolean }) => {
        cmdShow(id, opts, store);
      });

    docs
      .command('list')
      .description('List documents')
      .option('-t, --tag <tag>', 'Filter by tag')
      .option('-c, --card-id <cardId>', 'Filter by linked card')
      .action((opts: { tag?: string; cardId?: string }) => {
        cmdList(opts, store);
      });

    docs
      .command('edit <id> [content]')
      .description('Update document content')
      .option('-a, --author <author>', 'Author name')
      .option('-m, --message <message>', 'Version message')
      .option('-f, --file <file>', 'Read content from file')
      .action((id: string, content: string, opts: { author?: string; message?: string; file?: string }) => {
        cmdEdit(id, content || '', opts, store);
      });

    docs
      .command('versions <id>')
      .description('Show version history')
      .action((id: string) => {
        cmdVersions(id, store);
      });
  });

  api.logger.info('mc-docs loaded');
}
