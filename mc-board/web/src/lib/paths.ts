/**
 * paths.ts — single source of truth for all filesystem paths.
 *
 * Every file in the board web app that needs a path into the openclaw
 * state directory MUST import from here. No more inline resolution.
 *
 * Layout: $OPENCLAW_STATE_DIR/miniclaw/USER/...
 */

import * as path from "node:path";
import * as os from "node:os";
import { execFileSync } from "node:child_process";

/** Root openclaw state directory (e.g. ~/.openclaw) */
export function stateDir(): string {
  return process.env.OPENCLAW_STATE_DIR ?? path.join(os.homedir(), ".openclaw");
}

/** Miniclaw USER directory — where all user data lives */
export function userDir(): string {
  return path.join(stateDir(), "miniclaw", "USER");
}

/** Board database */
export function boardDbPath(): string {
  if (process.env.BOARD_DB_PATH) return process.env.BOARD_DB_PATH;
  return path.join(userDir(), "brain", "board.db");
}

/** Rolodex database */
export function rolodexDbPath(): string {
  if (process.env.ROLODEX_DB_PATH) return process.env.ROLODEX_DB_PATH;
  return path.join(userDir(), "rolodex", "contacts.db");
}

/** Rolodex JSON (legacy — for migration only) */
export function rolodexJsonPath(): string {
  if (process.env.ROLODEX_STORAGE_PATH) return process.env.ROLODEX_STORAGE_PATH;
  return path.join(userDir(), "rolodex", "contacts.json");
}

/** Setup state JSON */
export function setupStatePath(): string {
  return path.join(userDir(), "setup-state.json");
}

/** Workspace directory (md files for context injection) */
export function workspaceDir(): string {
  return path.join(stateDir(), "workspace");
}

/** Memory directory */
export function memoryDir(): string {
  return path.join(userDir(), "memory");
}

/** Knowledge base DB */
export function kbDbPath(): string {
  return path.join(userDir(), "kb", "kb.db");
}

/** Chat history directory */
export function chatHistoryDir(): string {
  return path.join(userDir(), "brain", "chat-history");
}

/** Media/uploads directory */
export function mediaDir(): string {
  return path.join(stateDir(), "media");
}

/** SYSTEM bin directory */
export function systemBinDir(): string {
  return path.join(stateDir(), "miniclaw", "SYSTEM", "bin");
}

/** Vault binary */
export function vaultBinPath(): string {
  return path.join(systemBinDir(), "mc-vault");
}

/** Logs directory */
export function logsDir(): string {
  return path.join(stateDir(), "logs");
}

/** Cron state directory */
export function cronDir(): string {
  return path.join(stateDir(), "cron");
}

/** Office directory */
export function officeDir(): string {
  return path.join(userDir(), "office");
}

/** Office layouts directory */
export function layoutsDir(): string {
  return path.join(officeDir(), "layouts");
}

/** Office zones JSON path */
export function zonesPath(): string {
  return path.join(officeDir(), "zones.json");
}

/** Brain directory — board DB, chat-history, office layouts, prompts */
export function brainDir(): string {
  return path.join(userDir(), "brain");
}

/** Office layouts directory (alias) */
export function officeLayoutsDir(): string {
  return layoutsDir();
}

/** Office zones JSON path (alias) */
export function officeZonesPath(): string {
  return zonesPath();
}

/** Plugins directory */
export function pluginsDir(): string {
  return path.join(stateDir(), "miniclaw", "plugins");
}

/** Miniclaw MANIFEST.json */
export function manifestPath(): string {
  return path.join(stateDir(), "miniclaw", "MANIFEST.json");
}

/** Temp directory */
export function tmpDir(): string {
  return path.join(stateDir(), "tmp");
}

/** VPN state directory */
export function vpnStateDir(): string {
  return path.join(stateDir(), ".vpn");
}

/** Projects directory */
export function projectsDir(): string {
  return path.join(userDir(), "projects");
}

/** miniclaw-os project directory */
export function minclawOsDir(): string {
  return path.join(stateDir(), "projects", "miniclaw-os");
}

/** Voice recordings directory */
export function voiceDir(): string {
  return path.join(userDir(), "voice");
}

/** Whisper models directory */
export function whisperModelsDir(): string {
  return path.join(stateDir(), "miniclaw", "SYSTEM", "whisper-models");
}

/**
 * Resolve the `claude` CLI binary path.
 * Priority: (1) CLAUDE_BIN env var, (2) `which claude`, (3) ~/.local/bin/claude fallback.
 */
export function claudeBinPath(): string {
  if (process.env.CLAUDE_BIN) return process.env.CLAUDE_BIN;
  try {
    return execFileSync("which", ["claude"], { encoding: "utf8", timeout: 3000 }).trim();
  } catch {}
  return path.join(os.homedir(), ".local", "bin", "claude");
}
