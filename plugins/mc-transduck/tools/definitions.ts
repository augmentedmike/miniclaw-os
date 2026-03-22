import type { AnyAgentTool } from "openclaw/plugin-sdk";
import {
  initClient,
  translateText,
  getStore,
  scanPluginDirs,
  warmCache,
  type TransduckPluginConfig,
} from "../src/client.js";
import * as path from "node:path";
import * as os from "node:os";
import * as fs from "node:fs";

type Logger = {
  info(m: string): void;
  warn(m: string): void;
  error(m: string): void;
};

function schema(
  props: Record<string, unknown>,
  required?: string[],
): unknown {
  return {
    type: "object",
    properties: props,
    required: required ?? [],
    additionalProperties: false,
  };
}

function str(description: string): unknown {
  return { type: "string", description };
}

function ok(text: string) {
  return {
    content: [{ type: "text" as const, text: text.trim() }],
    details: {},
  };
}

function toolErr(text: string) {
  return {
    content: [{ type: "text" as const, text: text.trim() }],
    isError: true,
    details: {},
  };
}

export function createTransduckTools(
  cfg: TransduckPluginConfig,
  logger: Logger,
): AnyAgentTool[] {
  return [
    // ── transduck_translate ──────────────────────────────────────────
    {
      name: "transduck_translate",
      label: "Translate Text",
      description:
        "Translate a string to a target language using the transduck AI translation engine. Uses SQLite cache for speed.",
      parameters: schema(
        {
          text: str("Source text to translate"),
          targetLang: str("Target language code (e.g. DE, ES, FR, JA, ZH)"),
          context: str("Optional context to improve translation quality"),
        },
        ["text", "targetLang"],
      ) as never,
      execute: async (_toolCallId: string, input: any) => {
        try {
          await initClient(cfg);
          const result = await translateText(
            input.text,
            input.targetLang.toUpperCase(),
            input.context,
          );
          return ok(result);
        } catch (err) {
          logger.error(`transduck_translate failed: ${err}`);
          return toolErr(`Translation failed: ${err}`);
        }
      },
    },

    // ── transduck_warm ───────────────────────────────────────────────
    {
      name: "transduck_warm",
      label: "Warm Translation Cache",
      description:
        "Scan miniclaw plugin source code for translatable strings and pre-warm the translation cache for specified languages.",
      parameters: schema(
        {
          pluginName: str(
            "Specific plugin to scan (omit for all plugins)",
          ),
          langs: str(
            "Comma-separated target language codes (e.g. DE,ES,FR)",
          ),
        },
        ["langs"],
      ) as never,
      execute: async (_toolCallId: string, input: any) => {
        try {
          await initClient(cfg);
          const langs = input.langs
            .split(",")
            .map((l: string) => l.trim().toUpperCase());
          const pluginsRoot = path.join(
            os.homedir(),
            ".openclaw/miniclaw/plugins",
          );

          let dirs: string[];
          if (input.pluginName) {
            const dir = path.join(pluginsRoot, input.pluginName);
            if (!fs.existsSync(dir)) {
              return toolErr(`Plugin not found: ${input.pluginName}`);
            }
            dirs = [dir];
          } else {
            dirs = fs
              .readdirSync(pluginsRoot)
              .filter((d) => !d.startsWith(".") && !d.startsWith("_"))
              .map((d) => path.join(pluginsRoot, d))
              .filter((d) => fs.statSync(d).isDirectory());
          }

          const entries = scanPluginDirs(dirs);
          if (entries.length === 0) {
            return ok("No translatable strings found.");
          }

          const { translated, errors } = await warmCache(entries, langs);
          return ok(
            `Warmed cache: ${translated} translated, ${errors} errors from ${entries.length} strings × ${langs.length} languages`,
          );
        } catch (err) {
          logger.error(`transduck_warm failed: ${err}`);
          return toolErr(`Cache warming failed: ${err}`);
        }
      },
    },

    // ── transduck_stats ──────────────────────────────────────────────
    {
      name: "transduck_stats",
      label: "Translation Cache Stats",
      description:
        "Show statistics about the transduck translation cache: total translations, failures, and per-language counts.",
      parameters: schema({}) as never,
      execute: async () => {
        try {
          await initClient(cfg);
          const store = getStore();
          if (!store) return toolErr("Translation store not initialized");

          const stats = await store.stats();
          const lines = [
            `Total translations: ${stats.totalTranslations}`,
            `Total failed: ${stats.totalFailed}`,
          ];
          if (Object.keys(stats.byLanguage).length > 0) {
            lines.push("By language:");
            for (const [lang, count] of Object.entries(stats.byLanguage)) {
              lines.push(`  ${lang}: ${count}`);
            }
          }
          return ok(lines.join("\n"));
        } catch (err) {
          logger.error(`transduck_stats failed: ${err}`);
          return toolErr(`Stats failed: ${err}`);
        }
      },
    },
  ];
}
