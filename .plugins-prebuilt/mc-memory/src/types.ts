/**
 * mc-memory — Shared type definitions
 *
 * Re-exports and abstractions over mc-kb and mc-memo types
 * so mc-memory doesn't import their internals directly at the type level.
 */

// Re-export interfaces that mc-memory needs from mc-kb
// These are duck-typed to avoid hard import coupling

export interface KBEntry {
  id: string;
  type: string;
  title: string;
  content: string;
  summary?: string;
  tags: string[];
  source?: string;
  severity?: string;
  created_at: string;
  updated_at: string;
}

export interface KBEntryCreate {
  type: string;
  title: string;
  content: string;
  summary?: string;
  tags?: string[];
  source?: string;
  severity?: string;
  id?: string;
  created_at?: string;
  updated_at?: string;
}

export interface SearchResult {
  entry: KBEntry;
  score: number;
  vecDistance?: number;
  ftsRank?: number;
}

export interface KBStore {
  add(entry: KBEntryCreate, vector?: Float32Array): KBEntry;
  update(id: string, patch: Record<string, unknown>, vector?: Float32Array): KBEntry;
  get(id: string): KBEntry | undefined;
  list(filter?: { type?: string; tag?: string; limit?: number }): KBEntry[];
  ftsSearch(query: string, limit?: number): { id: string; rank: number }[];
  vecSearch(vector: Float32Array, limit?: number): { id: string; distance: number }[];
  isVecLoaded(): boolean;
}

export interface Embedder {
  isReady(): boolean;
  embed(text: string): Promise<Float32Array | null>;
  load(): Promise<void>;
  getDims(): number;
}

// mc-memory specific types

export interface WriteResult {
  stored_in: "memo" | "kb" | "episodic";
  id?: string;       // KB entry ID if stored in KB
  cardId?: string;    // card ID if stored in memo
  date?: string;      // date if stored in episodic
  path?: string;      // file path where stored
}

export interface RecallResult {
  source: "kb" | "memo" | "episodic";
  score: number;      // relevance score (higher = better)
  // KB fields
  entry?: KBEntry;
  // Memo fields
  cardId?: string;
  line?: string;
  timestamp?: string;
  // Episodic fields
  date?: string;
  snippet?: string;
}

export interface PromoteResult {
  kb_id: string;
  title: string;
  type: string;
  source_type: "memo" | "episodic";
  source_ref: string; // cardId or date
}
