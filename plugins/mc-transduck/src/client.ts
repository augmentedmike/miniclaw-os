/**
 * Transduck client wrapper for MiniClaw.
 * Initializes the transduck SDK with config from the plugin, retrieves
 * API keys from mc-vault, and provides a clean interface for translation.
 */

import * as path from "node:path";
import * as os from "node:os";
import * as fs from "node:fs";
import { spawnSync } from "node:child_process";
import { initialize, setLanguage, ait, _getStore, _resetState } from "transduck";
import { scanPluginDirs, type ScanEntry } from "./scanner.js";

export { type ScanEntry } from "./scanner.js";
export { scanPluginDirs } from "./scanner.js";

export interface TransduckPluginConfig {
  dbDir: string;
  provider: string;
  apiKeyEnv: string;
  defaultSourceLang: string;
  defaultTargetLangs: string[];
  backendModel: string;
}

const DEFAULT_CONFIG: TransduckPluginConfig = {
  dbDir: path.join(os.homedir(), ".openclaw/miniclaw/USER/transduck"),
  provider: "openai",
  apiKeyEnv: "OPENAI_API_KEY",
  defaultSourceLang: "EN",
  defaultTargetLangs: ["DE", "ES", "FR"],
  backendModel: "gpt-4o-mini",
};

function resolvePath(p: string): string {
  if (p.startsWith("~/")) return path.join(os.homedir(), p.slice(2));
  return p;
}

/** Attempt to pull an API key from mc-vault, falling back to env. */
function resolveApiKey(envName: string): string | undefined {
  if (process.env[envName]) return process.env[envName];

  try {
    const result = spawnSync("openclaw", ["mc-vault", "get", envName], {
      encoding: "utf-8",
      timeout: 5000,
    });
    const val = result.stdout?.trim();
    if (val && result.status === 0) return val;
  } catch {
    // ignore — vault may not be available
  }

  return undefined;
}

export function resolvePluginConfig(
  raw: Partial<TransduckPluginConfig>,
): TransduckPluginConfig {
  return {
    dbDir: resolvePath(raw.dbDir ?? DEFAULT_CONFIG.dbDir),
    provider: raw.provider ?? DEFAULT_CONFIG.provider,
    apiKeyEnv: raw.apiKeyEnv ?? DEFAULT_CONFIG.apiKeyEnv,
    defaultSourceLang: raw.defaultSourceLang ?? DEFAULT_CONFIG.defaultSourceLang,
    defaultTargetLangs: raw.defaultTargetLangs ?? DEFAULT_CONFIG.defaultTargetLangs,
    backendModel: raw.backendModel ?? DEFAULT_CONFIG.backendModel,
  };
}

let _initialized = false;

/** Initialize the transduck SDK with the given plugin config. */
export async function initClient(cfg: TransduckPluginConfig): Promise<void> {
  if (_initialized) return;

  fs.mkdirSync(cfg.dbDir, { recursive: true });

  const apiKey = resolveApiKey(cfg.apiKeyEnv);
  if (apiKey) {
    process.env[cfg.apiKeyEnv] = apiKey;
  }

  const storagePath = path.join(cfg.dbDir, "translations.db");

  await initialize({
    projectName: "miniclaw",
    projectContext: "MiniClaw plugin ecosystem — an Agentic OS built on OpenClaw",
    sourceLang: cfg.defaultSourceLang,
    targetLangs: cfg.defaultTargetLangs,
    storagePath,
    provider: cfg.provider,
    apiKeyEnv: cfg.apiKeyEnv,
    backendModel: cfg.backendModel,
  } as any);

  _initialized = true;
}

/** Translate a single string to the target language. */
export async function translateText(
  text: string,
  targetLang: string,
  context?: string,
): Promise<string> {
  setLanguage(targetLang);
  const result = await ait(text, context ? { context } : undefined);
  return result.toString();
}

/** Get the underlying TranslationStore for stats/clear operations. */
export function getStore(): any {
  return _getStore();
}

/** Warm the translation cache for a list of scan entries and target languages. */
export async function warmCache(
  entries: ScanEntry[],
  targetLangs: string[],
  onProgress?: (done: number, total: number) => void,
): Promise<{ translated: number; errors: number }> {
  let translated = 0;
  let errors = 0;
  const total = entries.length * targetLangs.length;
  let done = 0;

  for (const entry of entries) {
    for (const lang of targetLangs) {
      try {
        setLanguage(lang);
        if (!entry.text) continue;
        await ait(entry.text, entry.context ? { context: entry.context } : undefined);
        translated++;
      } catch {
        errors++;
      }
      done++;
      onProgress?.(done, total);
    }
  }

  return { translated, errors };
}

/** Reset state (for testing). */
export function resetClient(): void {
  _initialized = false;
  _resetState();
}
