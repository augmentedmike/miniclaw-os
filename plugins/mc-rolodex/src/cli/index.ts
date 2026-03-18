#!/usr/bin/env node

/**
 * mc-rolodex CLI interface
 */

import { Command } from 'commander';
import { SearchEngine } from '../search/engine.js';
import { ContactBrowser } from '../tui/browser.js';
import chalk from 'chalk';
import * as fs from 'fs';

const program = new Command();
const engine = new SearchEngine();

program
  .name('mc-rolodex')
  .description('Interactive contact browser for MiniClaw')
  .version('1.0.0');

/**
 * search <query> - Search contacts by name, email, phone, domain, or tag
 */
program
  .command('search [query]')
  .option('-t, --type <type>', 'Search type: name|email|phone|domain|tag|multi (default: multi)')
  .option('-l, --limit <number>', 'Limit results (default: 50)', '50')
  .description('Search contacts')
  .action(async (query, options) => {
    if (!query) {
      console.error(chalk.red('Error: query required'));
      process.exit(1);
    }

    const results = engine.search({
      text: query,
      type: options.type as any,
      limit: parseInt(options.limit),
    });

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
      console.log();
    });
  });

/**
 * browse - Interactive TUI browser
 */
program
  .command('browse')
  .description('Open interactive TUI browser')
  .action(async () => {
    const browser = new ContactBrowser(engine);
    const allContacts = engine.getAll();

    if (allContacts.length === 0) {
      console.error(chalk.red('No contacts found. Add some first with: mc-rolodex add <json>'));
      process.exit(1);
    }

    // Show all contacts initially
    await browser.search('');
  });

/**
 * list [--tag <tag>] - List all contacts or filter by tag
 */
program
  .command('list')
  .option('-t, --tag <tag>', 'Filter by tag')
  .description('List all contacts')
  .action((options) => {
    let contacts = engine.getAll();

    if (options.tag) {
      contacts = contacts.filter(c => c.tags?.includes(options.tag));
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
    });
    console.log();
  });

/**
 * show <contact_id> - Display contact details
 */
program
  .command('show <id>')
  .description('Show contact details')
  .action((id) => {
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

    if (contact.tags?.length) {
      console.log(`\nTags: ${contact.tags.join(', ')}`);
    }

    if (contact.trustStatus) {
      const statusColor = contact.trustStatus === 'verified' ? chalk.green : chalk.yellow;
      console.log(`\nTrust Status: ${statusColor(contact.trustStatus)}`);
    }

    console.log();
  });

/**
 * add <json|file> - Add a new contact
 */
program
  .command('add <data>')
  .description('Add a new contact (JSON or file path)')
  .action((data) => {
    try {
      let contact;

      if (fs.existsSync(data)) {
        contact = JSON.parse(fs.readFileSync(data, 'utf8'));
      } else {
        contact = JSON.parse(data);
      }

      if (!contact.id) {
        contact.id = `contact_${Date.now()}`;
      }

      engine.add(contact);
      console.log(chalk.green(`✓ Contact added: ${contact.name}`));
    } catch (err) {
      console.error(chalk.red(`Error: ${(err as Error).message}`));
      process.exit(1);
    }
  });

/**
 * update <contact_id> - Update a contact's fields
 */
program
  .command('update <id>')
  .description('Update a contact (individual flags or JSON)')
  .option('--name <name>', 'Set contact name')
  .option('--email <email>', 'Set emails (comma-separated)')
  .option('--phone <phone>', 'Set phones (comma-separated)')
  .option('--tag <tag>', 'Set tags (comma-separated)')
  .option('--notes <notes>', 'Set notes')
  .option('--trust <status>', 'Set trust status: verified|untrusted|pending|unknown')
  .option('--json <data>', 'Merge arbitrary JSON fields')
  .action((id: string, opts: { name?: string; email?: string; phone?: string; tag?: string; notes?: string; trust?: string; json?: string }) => {
    const contact = engine.getById(id);
    if (!contact) {
      console.error(chalk.red(`Contact not found: ${id}`));
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
        let parsed;
        if (fs.existsSync(opts.json)) {
          parsed = JSON.parse(fs.readFileSync(opts.json, 'utf8'));
        } else {
          parsed = JSON.parse(opts.json);
        }
        Object.assign(updates, parsed);
      } catch (err) {
        console.error(chalk.red(`Invalid JSON: ${(err as Error).message}`));
        process.exit(1);
      }
    }

    if (Object.keys(updates).length === 0) {
      console.error(chalk.red('No updates provided. Use --name, --email, --tag, --notes, --trust, or --json.'));
      process.exit(1);
    }

    engine.update(id, updates as Parameters<typeof engine.update>[1]);
    console.log(chalk.green(`Updated: ${engine.getById(id)?.name ?? id}`));
  });

/**
 * delete <contact_id> - Delete a contact
 */
program
  .command('delete <id>')
  .description('Delete a contact')
  .action((id) => {
    const contact = engine.getById(id);

    if (!contact) {
      console.error(chalk.red(`Contact not found: ${id}`));
      process.exit(1);
    }

    engine.delete(id);
    console.log(chalk.green(`✓ Contact deleted: ${contact.name}`));
  });

program.parse(process.argv);

// Show help if no command
if (!process.argv.slice(2).length) {
  program.outputHelp();
}
