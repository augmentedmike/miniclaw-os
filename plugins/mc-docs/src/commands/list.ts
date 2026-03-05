/**
 * mc-docs list — List documents
 */

import { DocumentStore } from '../storage/json-store.js';

export function cmdList(
  options: {
    tag?: string;
    cardId?: string;
  } = {},
  store?: DocumentStore,
): void {
  const s = store || new DocumentStore();
  const items = s.list({
    tag: options.tag,
    card_id: options.cardId,
  });

  if (items.length === 0) {
    console.log('No documents found');
    return;
  }

  const padRight = (str: string, width: number) => str.padEnd(width);
  console.log('\n' + padRight('ID', 15) + padRight('Name', 30) + padRight('Author', 15) + padRight('Updated', 19));
  console.log('-'.repeat(80));

  for (const item of items) {
    const updated = new Date(item.updated).toISOString().split('T')[0];
    console.log(
      padRight(item.id, 15) +
      padRight(item.name.substring(0, 29), 30) +
      padRight(item.author.substring(0, 14), 15) +
      padRight(updated, 19),
    );
  }

  console.log(`\nTotal: ${items.length} document(s)`);
}
