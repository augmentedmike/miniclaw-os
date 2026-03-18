/**
 * mc-docs CLI entrypoint
 */

import { Command } from 'commander';
import { cmdCreate } from './commands/create.js';
import { cmdShow } from './commands/show.js';
import { cmdList } from './commands/list.js';
import { cmdEdit } from './commands/edit.js';
import { cmdVersions } from './commands/versions.js';

const program = new Command();

program
  .name('mc-docs')
  .description('Document authoring and versioning for MiniClaw')
  .version('1.0.0');

program
  .command('create <name>')
  .description('Create a new document')
  .option('--author <name>', 'Document author')
  .option('--tags <tags>', 'Comma-separated tags', (val) => val.split(','))
  .option('--card-id <id>', 'Link to a board card')
  .action((name, options) => {
    cmdCreate(name, {
      author: options.author,
      tags: options.tags || [],
      cardId: options.cardId,
    });
  });

program
  .command('show <id>')
  .description('Display document content')
  .option('--raw', 'Output raw body only (useful for piping)')
  .action((id, options) => {
    cmdShow(id, { raw: options.raw });
  });

program
  .command('list')
  .description('List all documents')
  .option('--tag <tag>', 'Filter by tag')
  .option('--card-id <id>', 'Filter by linked card')
  .action((options) => {
    cmdList({
      tag: options.tag,
      cardId: options.cardId,
    });
  });

program
  .command('edit <id>')
  .description('Update document content')
  .option('--author <name>', 'Author of the change')
  .option('--message <msg>', 'Version message/changelog entry')
  .option('--file <path>', 'Read content from file')
  .argument('[content]', 'Document content (or use --file)')
  .action((id, content, options) => {
    cmdEdit(id, content || '', {
      author: options.author,
      message: options.message,
      file: options.file,
    });
  });

program
  .command('versions <id>')
  .description('Show version history for a document')
  .action((id) => {
    cmdVersions(id);
  });

program.parse();
