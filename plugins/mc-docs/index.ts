/**
 * mc-docs — Document authoring and versioning plugin for MiniClaw
 */

export * from './src/schema/types.js';
export * from './src/storage/json-store.js';
export * from './src/commands/create.js';
export * from './src/commands/show.js';
export * from './src/commands/list.js';
export * from './src/commands/edit.js';
export * from './src/commands/versions.js';

// Default export
export { DocumentStore } from './src/storage/json-store.js';
