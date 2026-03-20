/**
 * mc-rolodex — CLI commands
 *
 * openclaw mc-rolodex search|list|show|add|delete
 */

import type { Command } from 'commander';
import { SearchEngine } from '../search/engine.js';
import chalk from 'chalk';
import * as fs from 'fs';
import { formatUserError, formatPluginError, DOCTOR_SUGGESTION } from '../../../shared/errors/format.js';

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
        console.log(formatUserError('[mc-rolodex] No contacts found', [
          'Try a broader search term or different type: --type name|email|phone|domain|tag|multi',
          'Add a contact: openclaw mc-rolodex add \'{"name":"Alice","emails":["alice@example.com"]}\'',
          'List all contacts: openclaw mc-rolodex list',
        ]));
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
        console.log(formatUserError('[mc-rolodex] No contacts found', [
          opts.tag ? `No contacts with tag "${opts.tag}" — try: openclaw mc-rolodex list (without filter)` : '',
          'Add a contact: openclaw mc-rolodex add \'{"name":"Alice","emails":["alice@example.com"]}\'',
        ].filter(Boolean)));
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
        console.error(formatUserError(`[mc-rolodex] Contact not found: ${id}`, [
          'Run: openclaw mc-rolodex list — to see all contacts',
          'Search by name: openclaw mc-rolodex search "<name>"',
        ]));
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
        console.error(formatPluginError('mc-rolodex', 'add', err, [
          'Contact must have a "name" field',
          'Format: openclaw mc-rolodex add \'{"name":"Alice","emails":["alice@example.com"]}\'',
          DOCTOR_SUGGESTION,
        ]));
        process.exit(1);
      }
    });

  // ---- mc-rolodex update ----
  rolodex
    .command('update <id>')
    .description('Update a contact (merge fields from JSON string or file)')
    .option('--name <name>', 'Set contact name')
    .option('--email <email>', 'Add or replace email (comma-separated for multiple)')
    .option('--phone <phone>', 'Add or replace phone (comma-separated for multiple)')
    .option('--tag <tag>', 'Add or replace tags (comma-separated for multiple)')
    .option('--notes <notes>', 'Set notes')
    .option('--trust <status>', 'Set trust status: verified|untrusted|pending|unknown')
    .option('--json <data>', 'Merge arbitrary JSON fields')
    .action((id: string, opts: { name?: string; email?: string; phone?: string; tag?: string; notes?: string; trust?: string; json?: string }) => {
      const contact = engine.getById(id);
      if (!contact) {
        console.error(formatUserError(`[mc-rolodex] Contact not found: ${id}`, [
          'Run: openclaw mc-rolodex list — to see all contacts',
          'Search by name: openclaw mc-rolodex search "<name>"',
        ]));
        process.exit(1);
      }

      const updates: Record<string, unknown> = {};

      if (opts.name) updates.name = opts.name;
      if (opts.email) updates.emails = opts.email.split(',').map(s => s.trim());
      if (opts.phone) updates.phones = opts.phone.split(',').map(s => s.trim());
      if (opts.tag) updates.tags = opts.tag.split(',').map(s => s.trim());
      if (opts.notes) updates.notes = opts.notes;
      if (opts.trust) updates.trustStatus = opts.trust;

      if (opts.json) {
        try {
          let parsed: Record<string, unknown>;
          if (fs.existsSync(opts.json)) {
            parsed = JSON.parse(fs.readFileSync(opts.json, 'utf8')) as Record<string, unknown>;
          } else {
            parsed = JSON.parse(opts.json) as Record<string, unknown>;
          }
          Object.assign(updates, parsed);
        } catch (err) {
          console.error(formatPluginError('mc-rolodex', 'update', err, [
            'Provide valid JSON: --json \'{"key":"value"}\'',
            DOCTOR_SUGGESTION,
          ]));
          process.exit(1);
        }
      }

      if (Object.keys(updates).length === 0) {
        console.error(formatUserError('[mc-rolodex] No updates provided', [
          'Use --name, --email, --tag, --notes, --trust, or --json',
          'Run: openclaw mc-rolodex update --help — for all options',
        ]));
        process.exit(1);
      }

      engine.update(id, updates as Parameters<typeof engine.update>[1]);
      console.log(chalk.green(`Updated: ${engine.getById(id)?.name ?? id}`));
    });

  // ---- mc-rolodex delete ----
  rolodex
    .command('delete <id>')
    .description('Delete a contact')
    .action((id: string) => {
      const contact = engine.getById(id);

      if (!contact) {
        console.error(formatUserError(`[mc-rolodex] Contact not found: ${id}`, [
          'Run: openclaw mc-rolodex list — to see all contacts',
          'Search by name: openclaw mc-rolodex search "<name>"',
        ]));
        process.exit(1);
      }

      engine.delete(id);
      console.log(chalk.green(`Deleted: ${contact.name}`));
    });
}
