/**
 * mc-docs create — Create a new document
 */

import { DocumentStore } from '../storage/json-store.js';

export function cmdCreate(
  name: string,
  options: {
    author?: string;
    tags?: string[];
    cardId?: string;
  } = {},
  store?: DocumentStore,
): void {
  const s = store || new DocumentStore();
  const author = options.author || process.env.USER || 'unknown';
  const tags = options.tags || [];

  const doc = s.create(name, author, '', tags, options.cardId);

  console.log(`✓ Created document: ${doc.metadata.id}`);
  console.log(`  Name: ${doc.metadata.name}`);
  console.log(`  Author: ${doc.metadata.author}`);
  if (doc.metadata.linked_card_id) {
    console.log(`  Linked to card: ${doc.metadata.linked_card_id}`);
  }
}
