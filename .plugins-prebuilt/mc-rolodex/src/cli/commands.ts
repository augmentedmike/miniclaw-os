/**
 * mc-rolodex — CLI commands
 *
 * openclaw mc-rolodex search|list|show|add|delete
 */

import type { Command } from 'commander';
import { SearchEngine } from '../search/engine.js';
import chalk from 'chalk';
import * as fs from 'fs';

export interface CliContext {
  program: Command;
  logger: { info: (m: string) => void; warn: (m: string) => void; error: (m: string) => void };
}

export function registerRolodexCommands(ctx: CliContext, engine: SearchEngine): void {
  const { program } = ctx;

  const rolodex = program
    .command('mc-rolodex')
    .description('Contact browser — search and manage trusted contacts')
    .addHelpText('after', `
Examples:
  openclaw mc-rolodex search "Sarah"
  openclaw mc-rolodex search "example.com" --type domain
  openclaw mc-rolodex add '{"name":"Alice","emails":["alice@example.com"]}'
  openclaw mc-rolodex list
  openclaw mc-rolodex list --tag work
  openclaw mc-rolodex show contact_123
  openclaw mc-rolodex delete contact_123`);

  // ---- mc-rolodex search ----
  rolodex
    .command('search <query>')
    .description('Search contacts by name, email, phone, domain, or tag')
    .option('-t, --type <type>', 'Search type: name|email|phone|domain|tag|multi (default: multi)')
    .option('-l, --limit <number>', 'Max results', '50')
    .option('--json', 'Output as JSON')
    .action((query: string, opts: { type?: string; limit: string; json?: boolean }) => {
      const results = engine.search({
        text: query,
        type: opts.type as 'name' | 'email' | 'phone' | 'domain' | 'tag' | 'multi' | undefined,
        limit: parseInt(opts.limit, 10),
      });

      if (opts.json) {
        console.log(JSON.stringify(results, null, 2));
        return;
      }

      if (results.length === 0) {
        console.log(chalk.yellow('No contacts found'));
        return;
      }

      console.log(chalk.bold(`\nFound ${results.length} contact(s):\n`));
      results.forEach((result, i) => {
        const contact = result.contact;
        console.log(`${i + 1}. ${chalk.bold(contact.name)} (score: ${result.score})`);
        if (contact.emails?.length) {
          console.log(`   Emails: ${contact.emails.join(', ')}`);
        }
        if (contact.phones?.length) {
          console.log(`   Phones: ${contact.phones.join(', ')}`);
        }
        if (contact.tags?.length) {
          console.log(`   Tags: ${contact.tags.join(', ')}`);
        }
        if (contact.trustStatus) {
          console.log(`   Trust: ${contact.trustStatus}`);
        }
        console.log();
      });
    });

  // ---- mc-rolodex list ----
  rolodex
    .command('list')
    .description('List all contacts')
    .option('-t, --tag <tag>', 'Filter by tag')
    .action((opts: { tag?: string }) => {
      let contacts = engine.getAll();

      if (opts.tag) {
        contacts = contacts.filter(c => c.tags?.includes(opts.tag!));
      }

      if (contacts.length === 0) {
        console.log(chalk.yellow('No contacts found'));
        return;
      }

      console.log(chalk.bold(`\n${contacts.length} contact(s):\n`));
      contacts.forEach((contact, i) => {
        console.log(`${i + 1}. ${chalk.bold(contact.name)}`);
        if (contact.emails?.length) {
          console.log(`   ${contact.emails.join(', ')}`);
        }
        if (contact.tags?.length) {
          console.log(`   Tags: ${contact.tags.join(', ')}`);
        }
      });
      console.log();
    });

  // ---- mc-rolodex show ----
  rolodex
    .command('show <id>')
    .description('Show full contact details')
    .action((id: string) => {
      const contact = engine.getById(id);

      if (!contact) {
        console.error(chalk.red(`Contact not found: ${id}`));
        process.exit(1);
      }

      console.log(chalk.bold(`\n${contact.name}`));
      console.log(`ID: ${contact.id}`);

      if (contact.emails?.length) {
        console.log(`\nEmails:`);
        contact.emails.forEach(e => console.log(`  ${e}`));
      }

      if (contact.phones?.length) {
        console.log(`\nPhones:`);
        contact.phones.forEach(p => console.log(`  ${p}`));
      }

      if (contact.domains?.length) {
        console.log(`\nDomains:`);
        contact.domains.forEach(d => console.log(`  ${d}`));
      }

      if (contact.tags?.length) {
        console.log(`\nTags: ${contact.tags.join(', ')}`);
      }

      if (contact.trustStatus) {
        const color = contact.trustStatus === 'verified' ? chalk.green : chalk.yellow;
        console.log(`\nTrust Status: ${color(contact.trustStatus)}`);
      }

      if (contact.notes) {
        console.log(`\nNotes: ${contact.notes}`);
      }

      console.log();
    });

  // ---- mc-rolodex add ----
  rolodex
    .command('add <data>')
    .description('Add a new contact (JSON string or path to JSON file)')
    .action((data: string) => {
      try {
        let contact: Record<string, unknown>;

        if (fs.existsSync(data)) {
          contact = JSON.parse(fs.readFileSync(data, 'utf8')) as Record<string, unknown>;
        } else {
          contact = JSON.parse(data) as Record<string, unknown>;
        }

        if (!contact['name']) {
          throw new Error('Contact must have a name');
        }

        if (!contact['id']) {
          contact['id'] = `contact_${Date.now()}`;
        }

        engine.add(contact as Parameters<typeof engine.add>[0]);
        console.log(chalk.green(`Added: ${contact['name']}`));
      } catch (err) {
        console.error(chalk.red(`Error: ${(err as Error).message}`));
        process.exit(1);
      }
    });

  // ---- mc-rolodex delete ----
  rolodex
    .command('delete <id>')
    .description('Delete a contact')
    .action((id: string) => {
      const contact = engine.getById(id);

      if (!contact) {
        console.error(chalk.red(`Contact not found: ${id}`));
        process.exit(1);
      }

      engine.delete(id);
      console.log(chalk.green(`Deleted: ${contact.name}`));
    });
}
