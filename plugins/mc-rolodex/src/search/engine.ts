/**
 * Contact search engine with in-memory indexing
 */

import { Contact, SearchQuery, SearchResult, ContactStore } from './types.js';
import * as fs from 'fs';
import * as path from 'path';

export class SearchEngine implements ContactStore {
  private contacts: Map<string, Contact> = new Map();
  private storagePath: string;

  constructor(storagePath: string = `${process.env.HOME}/.miniclaw/rolodex/contacts.json`) {
    this.storagePath = storagePath;
    this.loadContacts();
  }

  private loadContacts(): void {
    try {
      if (fs.existsSync(this.storagePath)) {
        const data = fs.readFileSync(this.storagePath, 'utf8');
        const contacts: Contact[] = JSON.parse(data);
        contacts.forEach(c => this.contacts.set(c.id, c));
      }
    } catch (err) {
      console.error(`Failed to load contacts from ${this.storagePath}:`, err);
    }
  }

  private saveContacts(): void {
    try {
      const dir = path.dirname(this.storagePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      const contacts = Array.from(this.contacts.values());
      fs.writeFileSync(this.storagePath, JSON.stringify(contacts, null, 2), 'utf8');
    } catch (err) {
      console.error(`Failed to save contacts to ${this.storagePath}:`, err);
    }
  }

  /**
   * Fuzzy match score (Levenshtein-ish)
   */
  private fuzzyScore(query: string, target: string): number {
    const q = query.toLowerCase();
    const t = target.toLowerCase();

    // Exact match
    if (q === t) return 100;

    // Prefix match
    if (t.startsWith(q)) return 80;

    // Contains match
    if (t.includes(q)) return 60;

    // Fuzzy: count matching characters in order
    let score = 0;
    let qIdx = 0;
    for (let tIdx = 0; tIdx < t.length && qIdx < q.length; tIdx++) {
      if (t[tIdx] === q[qIdx]) {
        score++;
        qIdx++;
      }
    }

    return qIdx === q.length ? Math.max(40, Math.floor((score / q.length) * 40)) : 0;
  }

  /**
   * Search by name
   */
  private searchByName(query: string): SearchResult[] {
    const results: SearchResult[] = [];

    for (const contact of this.contacts.values()) {
      const score = this.fuzzyScore(query, contact.name);
      if (score > 0) {
        results.push({
          contact,
          score,
          matches: [`name: ${contact.name}`],
        });
      }
    }

    return results.sort((a, b) => b.score - a.score);
  }

  /**
   * Search by email
   */
  private searchByEmail(query: string): SearchResult[] {
    const results: SearchResult[] = [];
    const q = query.toLowerCase();

    for (const contact of this.contacts.values()) {
      if (!contact.emails) continue;

      for (const email of contact.emails) {
        const emailLower = email.toLowerCase();
        // Only match if query is exact substring of email
        if (emailLower.includes(q)) {
          // Higher score for prefix/early match
          const isPrefix = emailLower.startsWith(q);
          const score = isPrefix ? 85 : 70;
          results.push({
            contact,
            score,
            matches: [`email: ${email}`],
          });
        }
      }
    }

    return results.sort((a, b) => b.score - a.score);
  }

  /**
   * Search by phone
   */
  private searchByPhone(query: string): SearchResult[] {
    const results: SearchResult[] = [];
    const normQuery = query.replace(/\D/g, '');

    // Only search if at least 3 digits provided
    if (normQuery.length < 3) return results;

    for (const contact of this.contacts.values()) {
      if (!contact.phones) continue;

      for (const phone of contact.phones) {
        const normPhone = phone.replace(/\D/g, '');
        if (normPhone.includes(normQuery)) {
          results.push({
            contact,
            score: 100,
            matches: [`phone: ${phone}`],
          });
        }
      }
    }

    return results;
  }

  /**
   * Search by domain
   */
  private searchByDomain(query: string): SearchResult[] {
    const results: SearchResult[] = [];
    const q = query.toLowerCase();

    for (const contact of this.contacts.values()) {
      if (!contact.emails) continue;

      for (const email of contact.emails) {
        const domain = email.split('@')[1];
        // Match if domain equals query or domain starts with query.
        if (domain && (domain === q || domain.startsWith(q + '.'))) {
          results.push({
            contact,
            score: 100,
            matches: [`domain: ${domain} (${email})`],
          });
        }
      }
    }

    return results;
  }

  /**
   * Search by tag
   */
  private searchByTag(query: string): SearchResult[] {
    const results: SearchResult[] = [];

    for (const contact of this.contacts.values()) {
      if (!contact.tags) continue;

      if (contact.tags.includes(query.toLowerCase())) {
        results.push({
          contact,
          score: 100,
          matches: [`tag: ${query}`],
        });
      }
    }

    return results;
  }

  /**
   * Multi-field search (default)
   */
  private searchMulti(query: string): SearchResult[] {
    // Priority order: name > email > tag > domain > phone
    // Return results from the first field that has matches
    
    const nameResults = this.searchByName(query);
    if (nameResults.length > 0) return nameResults;

    const emailResults = this.searchByEmail(query);
    if (emailResults.length > 0) return emailResults;

    const tagResults = this.searchByTag(query);
    if (tagResults.length > 0) return tagResults;

    const domainResults = this.searchByDomain(query);
    if (domainResults.length > 0) return domainResults;

    const phoneResults = this.searchByPhone(query);
    if (phoneResults.length > 0) return phoneResults;

    return [];
  }

  /**
   * Execute search
   */
  search(query: SearchQuery): SearchResult[] {
    const type = query.type || 'multi';
    const limit = query.limit || 50;

    let results: SearchResult[];

    switch (type) {
      case 'name':
        results = this.searchByName(query.text);
        break;
      case 'email':
        results = this.searchByEmail(query.text);
        break;
      case 'phone':
        results = this.searchByPhone(query.text);
        break;
      case 'domain':
        results = this.searchByDomain(query.text);
        break;
      case 'tag':
        results = this.searchByTag(query.text);
        break;
      default:
        results = this.searchMulti(query.text);
    }

    return results.slice(0, limit);
  }

  /**
   * Contact store operations
   */
  getAll(): Contact[] {
    return Array.from(this.contacts.values());
  }

  getById(id: string): Contact | null {
    return this.contacts.get(id) || null;
  }

  add(contact: Contact): void {
    this.contacts.set(contact.id, contact);
    this.saveContacts();
  }

  update(id: string, updates: Partial<Contact>): void {
    const contact = this.contacts.get(id);
    if (contact) {
      this.contacts.set(id, { ...contact, ...updates });
      this.saveContacts();
    }
  }

  delete(id: string): void {
    this.contacts.delete(id);
    this.saveContacts();
  }
}
