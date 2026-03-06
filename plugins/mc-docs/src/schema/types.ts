/**
 * mc-docs — Document schema and types
 */

export interface DocumentMetadata {
  id: string;
  name: string;
  author: string;
  created: string; // ISO 8601
  updated: string; // ISO 8601
  version: number;
  tags: string[];
  linked_card_id?: string; // Link to mc-board card
}

export interface DocumentVersion {
  version: number;
  timestamp: string; // ISO 8601
  author: string;
  message?: string; // Version message/changelog entry
  hash: string; // SHA-256 hash of body for diff tracking
}

export interface Document {
  metadata: DocumentMetadata;
  body: string; // Markdown
  history: DocumentVersion[];
}

export interface DocumentListItem {
  id: string;
  name: string;
  author: string;
  updated: string;
  version: number;
  tags: string[];
  linked_card_id?: string;
}

export interface StorageOptions {
  basePath?: string; // Defaults to $OPENCLAW_STATE_DIR/user/augmentedmike_bot/docs (or ~/am/... fallback)
}
