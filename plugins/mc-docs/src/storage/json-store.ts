/**
 * JSON storage backend for mc-docs
 * Stores each document as a JSON file with immutable version history
 */

import { createHash } from 'crypto';
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import { Document, DocumentMetadata, DocumentVersion, DocumentListItem, StorageOptions } from '../schema/types.js';

export class DocumentStore {
  private basePath: string;

  constructor(options: StorageOptions = {}) {
    this.basePath = options.basePath ||
      (process.env.OPENCLAW_STATE_DIR
        ? join(process.env.OPENCLAW_STATE_DIR, 'USER', 'docs')
        : join(homedir(), '.openclaw', 'USER', 'docs'));

    // Ensure directory exists
    if (!existsSync(this.basePath)) {
      mkdirSync(this.basePath, { recursive: true });
    }
  }

  private generateId(): string {
    return `doc_${Math.random().toString(36).substring(2, 11)}`;
  }

  private computeHash(content: string): string {
    return createHash('sha256').update(content).digest('hex');
  }

  private getDocumentPath(id: string): string {
    return join(this.basePath, `${id}.json`);
  }

  private loadDocument(filePath: string): Document {
    const content = readFileSync(filePath, 'utf-8');
    return JSON.parse(content);
  }

  private saveDocument(filePath: string, doc: Document): void {
    writeFileSync(filePath, JSON.stringify(doc, null, 2), 'utf-8');
  }

  create(name: string, author: string, body: string = '', tags: string[] = [], linked_card_id?: string): Document {
    const id = this.generateId();
    const now = new Date().toISOString();
    const hash = this.computeHash(body);

    const doc: Document = {
      metadata: {
        id,
        name,
        author,
        created: now,
        updated: now,
        version: 1,
        tags,
        linked_card_id,
      },
      body,
      history: [
        {
          version: 1,
          timestamp: now,
          author,
          message: 'Initial creation',
          hash,
        },
      ],
    };

    const filePath = this.getDocumentPath(id);
    this.saveDocument(filePath, doc);
    return doc;
  }

  get(id: string): Document | null {
    const filePath = this.getDocumentPath(id);
    if (!existsSync(filePath)) {
      return null;
    }
    return this.loadDocument(filePath);
  }

  update(id: string, body: string, author: string, message?: string): Document {
    const filePath = this.getDocumentPath(id);
    if (!existsSync(filePath)) {
      throw new Error(`Document not found: ${id}`);
    }

    const doc = this.loadDocument(filePath);
    const hash = this.computeHash(body);
    const lastVersion = doc.history[doc.history.length - 1];

    // Only create new version if body changed
    if (hash !== lastVersion.hash) {
      doc.metadata.version++;
      doc.metadata.updated = new Date().toISOString();
      doc.body = body;
      doc.history.push({
        version: doc.metadata.version,
        timestamp: doc.metadata.updated,
        author,
        message,
        hash,
      });
    }

    this.saveDocument(filePath, doc);
    return doc;
  }

  list(filter?: { tag?: string; card_id?: string }): DocumentListItem[] {
    const files = readdirSync(this.basePath).filter((f) => f.endsWith('.json'));
    const items: DocumentListItem[] = [];

    for (const file of files) {
      const doc = this.loadDocument(join(this.basePath, file));
      const metadata = doc.metadata;

      // Apply filters
      if (filter?.tag && !metadata.tags.includes(filter.tag)) {
        continue;
      }
      if (filter?.card_id && metadata.linked_card_id !== filter.card_id) {
        continue;
      }

      items.push({
        id: metadata.id,
        name: metadata.name,
        author: metadata.author,
        updated: metadata.updated,
        version: metadata.version,
        tags: metadata.tags,
        linked_card_id: metadata.linked_card_id,
      });
    }

    return items.sort((a, b) => new Date(b.updated).getTime() - new Date(a.updated).getTime());
  }

  getVersions(id: string): DocumentVersion[] {
    const doc = this.get(id);
    if (!doc) {
      throw new Error(`Document not found: ${id}`);
    }
    return doc.history;
  }

  delete(id: string): void {
    const filePath = this.getDocumentPath(id);
    if (existsSync(filePath)) {
      const fs = require('fs');
      fs.unlinkSync(filePath);
    }
  }

  linkCard(id: string, cardId: string): Document {
    const doc = this.get(id);
    if (!doc) {
      throw new Error(`Document not found: ${id}`);
    }
    doc.metadata.linked_card_id = cardId;
    doc.metadata.updated = new Date().toISOString();
    this.saveDocument(this.getDocumentPath(id), doc);
    return doc;
  }
}
