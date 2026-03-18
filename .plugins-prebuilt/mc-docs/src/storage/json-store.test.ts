/**
 * Tests for JSON storage backend
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { DocumentStore } from './json-store.js';
import { rmSync, existsSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

describe('DocumentStore', () => {
  let store: DocumentStore;
  let testDir: string;

  beforeEach(() => {
    testDir = join(tmpdir(), `mc-docs-test-${Date.now()}`);
    store = new DocumentStore({ basePath: testDir });
  });

  afterEach(() => {
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true });
    }
  });

  describe('create', () => {
    it('should create a new document', () => {
      const doc = store.create('Test Doc', 'author1');
      expect(doc.metadata.name).toBe('Test Doc');
      expect(doc.metadata.author).toBe('author1');
      expect(doc.metadata.version).toBe(1);
      expect(doc.body).toBe('');
      expect(doc.history.length).toBe(1);
    });

    it('should create document with tags', () => {
      const doc = store.create('Test', 'author', '', ['tag1', 'tag2']);
      expect(doc.metadata.tags).toEqual(['tag1', 'tag2']);
    });

    it('should create document with initial body', () => {
      const body = '# Test\nContent here';
      const doc = store.create('Test', 'author', body);
      expect(doc.body).toBe(body);
    });

    it('should link to card on creation', () => {
      const doc = store.create('Test', 'author', '', [], 'crd_abc123');
      expect(doc.metadata.linked_card_id).toBe('crd_abc123');
    });

    it('should persist document to filesystem', () => {
      const doc = store.create('Test', 'author');
      const fetched = store.get(doc.metadata.id);
      expect(fetched).not.toBeNull();
      expect(fetched?.metadata.id).toBe(doc.metadata.id);
    });
  });

  describe('get', () => {
    it('should retrieve existing document', () => {
      const created = store.create('Test', 'author');
      const fetched = store.get(created.metadata.id);
      expect(fetched).not.toBeNull();
      expect(fetched?.metadata.name).toBe('Test');
    });

    it('should return null for non-existent document', () => {
      const fetched = store.get('doc_nonexistent');
      expect(fetched).toBeNull();
    });
  });

  describe('update', () => {
    it('should update document body and increment version', () => {
      const created = store.create('Test', 'author', 'Original content');
      const updated = store.update(created.metadata.id, 'Updated content', 'author2');
      expect(updated.body).toBe('Updated content');
      expect(updated.metadata.version).toBe(2);
    });

    it('should add new version to history', () => {
      const created = store.create('Test', 'author', 'Original');
      store.update(created.metadata.id, 'Second', 'author2', 'Added text');
      const fetched = store.get(created.metadata.id);
      expect(fetched?.history.length).toBe(2);
      expect(fetched?.history[1].message).toBe('Added text');
    });

    it('should not create version if content unchanged', () => {
      const created = store.create('Test', 'author', 'Content');
      store.update(created.metadata.id, 'Content', 'author2');
      const fetched = store.get(created.metadata.id);
      expect(fetched?.metadata.version).toBe(1);
      expect(fetched?.history.length).toBe(1);
    });

    it('should update the updated timestamp', async () => {
      const created = store.create('Test', 'author', 'Content');
      const originalUpdated = created.metadata.updated;
      await new Promise((resolve) => setTimeout(resolve, 5));
      const updated = store.update(created.metadata.id, 'New content', 'author2');
      expect(updated.metadata.updated).not.toBe(originalUpdated);
    });

    it('should throw error for non-existent document', () => {
      expect(() => store.update('doc_nonexistent', 'content', 'author')).toThrow();
    });
  });

  describe('list', () => {
    beforeEach(() => {
      store.create('Doc A', 'author1', '', ['blog']);
      store.create('Doc B', 'author2', '', ['draft']);
      store.create('Doc C', 'author1', '', ['blog', 'draft']);
    });

    it('should list all documents', () => {
      const list = store.list();
      expect(list.length).toBe(3);
    });

    it('should filter by tag', () => {
      const list = store.list({ tag: 'blog' });
      expect(list.length).toBe(2);
      expect(list.every((d) => d.tags.includes('blog'))).toBe(true);
    });

    it('should filter by card_id', () => {
      const created = store.create('Test', 'author', '', [], 'crd_abc');
      const list = store.list({ card_id: 'crd_abc' });
      expect(list.length).toBe(1);
      expect(list[0].id).toBe(created.metadata.id);
    });

    it('should return empty list for no matches', () => {
      const list = store.list({ tag: 'nonexistent' });
      expect(list.length).toBe(0);
    });

    it('should sort by updated time (newest first)', () => {
      const docs = store.list();
      for (let i = 0; i < docs.length - 1; i++) {
        expect(new Date(docs[i].updated).getTime()).toBeGreaterThanOrEqual(
          new Date(docs[i + 1].updated).getTime(),
        );
      }
    });
  });

  describe('getVersions', () => {
    it('should return version history', () => {
      const created = store.create('Test', 'author1', 'v1');
      store.update(created.metadata.id, 'v2', 'author2');
      store.update(created.metadata.id, 'v3', 'author1');

      const versions = store.getVersions(created.metadata.id);
      expect(versions.length).toBe(3);
      expect(versions[0].version).toBe(1);
      expect(versions[2].version).toBe(3);
    });

    it('should throw error for non-existent document', () => {
      expect(() => store.getVersions('doc_nonexistent')).toThrow();
    });
  });

  describe('linkCard', () => {
    it('should link document to card', () => {
      const created = store.create('Test', 'author');
      const linked = store.linkCard(created.metadata.id, 'crd_abc123');
      expect(linked.metadata.linked_card_id).toBe('crd_abc123');
    });

    it('should persist link to filesystem', () => {
      const created = store.create('Test', 'author');
      store.linkCard(created.metadata.id, 'crd_abc123');
      const fetched = store.get(created.metadata.id);
      expect(fetched?.metadata.linked_card_id).toBe('crd_abc123');
    });

    it('should throw error for non-existent document', () => {
      expect(() => store.linkCard('doc_nonexistent', 'crd_abc')).toThrow();
    });
  });

  describe('delete', () => {
    it('should delete document from filesystem', () => {
      const created = store.create('Test', 'author');
      expect(store.get(created.metadata.id)).not.toBeNull();
      store.delete(created.metadata.id);
      expect(store.get(created.metadata.id)).toBeNull();
    });

    it('should not error when deleting non-existent document', () => {
      expect(() => store.delete('doc_nonexistent')).not.toThrow();
    });
  });
});
