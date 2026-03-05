/**
 * mc-docs show — Display document content
 */

import { DocumentStore } from '../storage/json-store.js';

export function cmdShow(id: string, options: { raw?: boolean } = {}, store?: DocumentStore): void {
  const s = store || new DocumentStore();
  const doc = s.get(id);

  if (!doc) {
    console.error(`✗ Document not found: ${id}`);
    process.exit(1);
  }

  if (options.raw) {
    // Raw body output (useful for piping)
    console.log(doc.body);
  } else {
    // Formatted output
    console.log(`# ${doc.metadata.name}`);
    console.log(`Author: ${doc.metadata.author}`);
    console.log(`Version: ${doc.metadata.version}`);
    console.log(`Updated: ${doc.metadata.updated}`);
    if (doc.metadata.tags.length > 0) {
      console.log(`Tags: ${doc.metadata.tags.join(', ')}`);
    }
    if (doc.metadata.linked_card_id) {
      console.log(`Card: ${doc.metadata.linked_card_id}`);
    }
    console.log('---\n');
    console.log(doc.body);
  }
}
