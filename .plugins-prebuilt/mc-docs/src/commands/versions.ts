/**
 * mc-docs versions — Show version history
 */

import { DocumentStore } from '../storage/json-store.js';

export function cmdVersions(id: string, store?: DocumentStore): void {
  const s = store || new DocumentStore();

  try {
    const versions = s.getVersions(id);

    console.log(`\nVersion History for ${id}:`);
    const padRight = (str: string, width: number) => str.padEnd(width);
    console.log(padRight('Ver', 5) + padRight('Author', 15) + padRight('Timestamp', 19) + padRight('Message', 30));
    console.log('-'.repeat(70));

    for (const v of versions) {
      const timestamp = new Date(v.timestamp).toISOString().split('T')[0];
      const msg = v.message || '—';
      console.log(
        padRight(String(v.version), 5) +
        padRight(v.author.substring(0, 14), 15) +
        padRight(timestamp, 19) +
        padRight(msg.substring(0, 29), 30),
      );
    }
  } catch (err) {
    console.error(`✗ Error fetching versions:`, (err as Error).message);
    process.exit(1);
  }
}
