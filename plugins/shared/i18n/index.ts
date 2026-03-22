/**
 * Shared i18n utility for the miniclaw-os plugin ecosystem.
 *
 * Usage:
 *   import { createTranslator, getLocale } from '@miniclaw/shared/i18n'
 *
 *   const t = createTranslator('es')
 *   console.log(t('plugins.mc-board.description'))
 *   // → "Tablero kanban con máquina de estados — la corteza prefrontal del agente"
 *
 * The translator loads JSON message files from the translations/ directory
 * at the repository root. Falls back to English if a key is missing in the
 * requested locale.
 */

import { readFileSync } from 'node:fs'
import { join } from 'node:path'

export type Locale = 'en' | 'es' | 'zh-CN'

const SUPPORTED_LOCALES: Locale[] = ['en', 'es', 'zh-CN']
const DEFAULT_LOCALE: Locale = 'en'

// Cache loaded translations in memory
const cache = new Map<Locale, Record<string, string>>()

/**
 * Resolve the translations directory. Walks up from this file to find
 * the repo root (contains translations/).
 */
function translationsDir(): string {
  // From plugins/shared/i18n/ → walk up 3 levels to repo root
  return join(__dirname, '..', '..', '..', 'translations')
}

/**
 * Load and cache a locale's translation file.
 */
function loadLocale(locale: Locale): Record<string, string> {
  if (cache.has(locale)) return cache.get(locale)!

  try {
    const filePath = join(translationsDir(), `${locale}.json`)
    const raw = readFileSync(filePath, 'utf-8')
    const messages = JSON.parse(raw) as Record<string, string>
    cache.set(locale, messages)
    return messages
  } catch {
    // If the locale file doesn't exist, return empty
    cache.set(locale, {})
    return {}
  }
}

/**
 * Detect the current locale from environment variables.
 *
 * Checks (in order):
 *   1. MINICLAW_LOCALE
 *   2. LANG (extracts language code)
 *   3. Falls back to 'en'
 */
export function getLocale(): Locale {
  const envLocale = process.env.MINICLAW_LOCALE
  if (envLocale && SUPPORTED_LOCALES.includes(envLocale as Locale)) {
    return envLocale as Locale
  }

  const lang = process.env.LANG || ''
  if (lang.startsWith('es')) return 'es'
  if (lang.startsWith('zh')) return 'zh-CN'

  return DEFAULT_LOCALE
}

/**
 * Create a translator function for the given locale.
 *
 * The returned function takes a dot-separated key and returns the
 * translated string. Falls back to English if the key is missing in
 * the requested locale. Returns the key itself if not found in any locale.
 *
 * @param locale - Target locale (defaults to auto-detected locale)
 * @returns Translation function `(key: string) => string`
 */
export function createTranslator(locale?: Locale): (key: string) => string {
  const resolvedLocale = locale || getLocale()
  const messages = loadLocale(resolvedLocale)
  const fallback = resolvedLocale !== DEFAULT_LOCALE ? loadLocale(DEFAULT_LOCALE) : messages

  return function t(key: string): string {
    return messages[key] ?? fallback[key] ?? key
  }
}

/**
 * Quick one-shot translation. Loads the locale, looks up the key,
 * falls back to English, then to the raw key.
 */
export function translate(key: string, locale?: Locale): string {
  return createTranslator(locale)(key)
}

export { SUPPORTED_LOCALES, DEFAULT_LOCALE }
