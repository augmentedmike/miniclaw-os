/**
 * mc-docs edit — Update document content
 */

import { DocumentStore } from '../storage/json-store.js';
import { readFileSync } from 'fs';

export function cmdEdit(
  id: string,
  content: string,
  options: {
    author?: string;
    message?: string;
    file?: string;
  } = {},
  store?: DocumentStore,
): void {
  const s = store || new DocumentStore();

  let body = content;
  if (options.file) {
    body = readFileSync(options.file, 'utf-8');
  }

  const author = options.author || process.env.USER || 'unknown';

  try {
    const doc = s.update(id, body, author, options.message);
    console.log(`✓ Updated document: ${id}`);
    console.log(`  Name: ${doc.metadata.name}`);
    console.log(`  Version: ${doc.metadata.version}`);
    console.log(`  Updated: ${doc.metadata.updated}`);
  } catch (err) {
    console.error(`✗ Error updating document:`, (err as Error).message);
    process.exit(1);
  }
}
