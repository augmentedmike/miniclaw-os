/**
 * Contact types for mc-rolodex
 */

export interface Contact {
  id: string;
  name: string;
  emails?: string[];
  phones?: string[];
  domains?: string[];
  tags?: string[];
  trustStatus?: 'verified' | 'untrusted' | 'pending' | 'unknown';
  lastVerified?: Date;
  notes?: string;
}

export interface SearchResult {
  contact: Contact;
  score: number;
  matches: string[];
}

export interface SearchQuery {
  text: string;
  type?: 'name' | 'email' | 'phone' | 'domain' | 'tag' | 'multi';
  limit?: number;
}

export interface ContactStore {
  getAll(): Contact[];
  getById(id: string): Contact | null;
  add(contact: Contact): void;
  update(id: string, contact: Partial<Contact>): void;
  delete(id: string): void;
  search(query: SearchQuery): SearchResult[];
}
