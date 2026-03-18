/**
 * TUI contact browser for mc-rolodex
 * Uses blessed for terminal UI
 */

import blessed from 'blessed';
import chalk from 'chalk';
import { Contact, SearchResult } from '../search/types.js';
import { SearchEngine } from '../search/engine.js';

export class ContactBrowser {
  private engine: SearchEngine;
  private screen: blessed.Widgets.Screen;
  private currentResults: SearchResult[] = [];
  private selectedIndex: number = 0;

  constructor(engine: SearchEngine) {
    this.engine = engine;
    this.screen = blessed.screen({
      mouse: true,
      title: 'MiniClaw Contact Browser',
      smartCSR: true,
      vi: true,
    });

    this.setupKeyBindings();
  }

  private setupKeyBindings(): void {
    // Exit
    this.screen.key(['escape', 'q', 'C-c'], () => {
      return process.exit(0);
    });

    // Arrow keys for navigation
    this.screen.key(['up'], () => {
      if (this.selectedIndex > 0) {
        this.selectedIndex--;
        this.render();
      }
    });

    this.screen.key(['down'], () => {
      if (this.selectedIndex < this.currentResults.length - 1) {
        this.selectedIndex++;
        this.render();
      }
    });

    // Enter to view details
    this.screen.key(['enter'], () => {
      if (this.currentResults.length > 0) {
        this.showContactDetails(this.currentResults[this.selectedIndex]!.contact);
      }
    });
  }

  /**
   * Main search and display loop
   */
  async search(query: string, type?: string): Promise<void> {
    this.currentResults = this.engine.search({
      text: query,
      type: type as any,
      limit: 100,
    });

    this.selectedIndex = 0;
    this.render();
    this.screen.render();
  }

  /**
   * Render current search results
   */
  private render(): void {
    this.screen.children = []; // Clear

    // Header
    const header = blessed.box({
      parent: this.screen,
      top: 0,
      left: 0,
      width: '100%',
      height: 3,
      content: `{bold}MiniClaw Contact Browser{/bold}\n{gray}Type 'q' to quit, arrow keys to navigate, enter to view details{/gray}`,
      border: 'line',
      style: {
        border: { fg: 'blue' },
      },
    });

    // Results list
    const resultsBox = blessed.box({
      parent: this.screen,
      top: 4,
      left: 0,
      width: '100%',
      height: 'shrink',
      scrollable: true,
      keys: true,
      vi: true,
      alwaysScroll: true,
      style: {
        selected: {
          bg: 'blue',
          fg: 'white',
        },
      },
    });

    if (this.currentResults.length === 0) {
      resultsBox.setContent('{yellow}No contacts found{/yellow}');
    } else {
      let content = '';
      for (let i = 0; i < this.currentResults.length; i++) {
        const result = this.currentResults[i]!;
        const contact = result.contact;
        const isSelected = i === this.selectedIndex;

        const prefix = isSelected ? '> ' : '  ';
        const bg = isSelected ? '{blue}' : '';
        const reset = isSelected ? '{/blue}' : '';

        content += `${bg}${prefix}{bold}${contact.name}{/bold}${reset}\n`;
        if (contact.emails && contact.emails.length > 0) {
          content += `${bg}    ${contact.emails[0]}${reset}\n`;
        }
        content += '\n';
      }
      resultsBox.setContent(content);
    }
  }

  /**
   * Display contact details in a modal
   */
  private showContactDetails(contact: Contact): void {
    const modal = blessed.box({
      parent: this.screen,
      top: 'center',
      left: 'center',
      width: 60,
      height: 20,
      border: 'line',
      scrollable: true,
      keys: true,
      vi: true,
      style: {
        border: { fg: 'green' },
      },
    });

    let content = `{bold}${contact.name}{/bold}\n`;
    content += `ID: ${contact.id}\n\n`;

    if (contact.emails && contact.emails.length > 0) {
      content += `{bold}Emails:{/bold}\n`;
      contact.emails.forEach(e => (content += `  ${e}\n`));
      content += '\n';
    }

    if (contact.phones && contact.phones.length > 0) {
      content += `{bold}Phones:{/bold}\n`;
      contact.phones.forEach(p => (content += `  ${p}\n`));
      content += '\n';
    }

    if (contact.tags && contact.tags.length > 0) {
      content += `{bold}Tags:{/bold} ${contact.tags.join(', ')}\n\n`;
    }

    if (contact.trustStatus) {
      const statusColor = contact.trustStatus === 'verified' ? 'green' : 'yellow';
      content += `{bold}Trust Status:{/bold} {${statusColor}}${contact.trustStatus}{/${statusColor}}\n`;
    }

    content += '\n{gray}Press "q" to close{/gray}';

    modal.setContent(content);
    modal.key(['q', 'escape'], () => {
      modal.destroy();
      this.screen.render();
    });

    this.screen.render();
  }
}
