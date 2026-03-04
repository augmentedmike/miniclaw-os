/**
 * mc-rolodex — Contact browser plugin for MiniClaw
 */

export * from './src/search/types.js';
export * from './src/search/engine.js';
export * from './src/tui/browser.js';

// Default export
export { SearchEngine } from './src/search/engine.js';
export { ContactBrowser } from './src/tui/browser.js';
