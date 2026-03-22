import type { Command } from "commander";
import * as path from "node:path";
import * as os from "node:os";
import * as fs from "node:fs";
import {
  initClient,
  translateText,
  getStore,
  scanPluginDirs,
  warmCache,
  type TransduckPluginConfig,
} from "../src/client.js";

type Logger = {
  info(m: string): void;
  warn(m: string): void;
  error(m: string): void;
};

export interface CliContext {
  program: Command;
  logger: Logger;
}

export function registerTransduckCommands(
  ctx: CliContext,
  cfg: TransduckPluginConfig,
): void {
  const { program, logger } = ctx;

  const td = program
    .command("mc-transduck")
    .description("AI translation framework for MiniClaw i18n")
    .addHelpText(
      "after",
      `
Examples:
  openclaw mc-transduck translate "Hello world" --to DE
  openclaw mc-transduck warm --langs DE,ES,FR
  openclaw mc-transduck stats
  openclaw mc-transduck clear --failed-only`,
    );

  // ── translate ──────────────────────────────────────────────────────
  td.command("translate")
    .description("Translate a single string")
    .argument("<text>", "Source text to translate")
    .requiredOption("--to <lang>", "Target language code (e.g. DE, ES, FR)")
    .option("--context <ctx>", "Additional context for the translation")
    .action(async (text: string, opts: { to: string; context?: string }) => {
      try {
        await initClient(cfg);
        const result = await translateText(text, opts.to.toUpperCase(), opts.context);
        console.log(result);
      } catch (err) {
        logger.error(`translate failed: ${err}`);
        process.exit(1);
      }
    });

  // ── warm ───────────────────────────────────────────────────────────
  td.command("warm")
    .description("Scan plugin source and pre-warm translation cache")
    .option(
      "--plugin <name>",
      "Plugin name to scan (default: all plugins)",
    )
    .option(
      "--langs <langs>",
      "Comma-separated target language codes",
      cfg.defaultTargetLangs.join(","),
    )
    .action(async (opts: { plugin?: string; langs: string }) => {
      try {
        await initClient(cfg);
        const langs = opts.langs.split(",").map((l) => l.trim().toUpperCase());
        const pluginsRoot = path.join(
          os.homedir(),
          ".openclaw/miniclaw/plugins",
        );

        let dirs: string[];
        if (opts.plugin) {
          const dir = path.join(pluginsRoot, opts.plugin);
          if (!fs.existsSync(dir)) {
            logger.error(`Plugin not found: ${dir}`);
            process.exit(1);
          }
          dirs = [dir];
        } else {
          dirs = fs
            .readdirSync(pluginsRoot)
            .filter((d) => !d.startsWith(".") && !d.startsWith("_"))
            .map((d) => path.join(pluginsRoot, d))
            .filter((d) => fs.statSync(d).isDirectory());
        }

        logger.info(`Scanning ${dirs.length} plugin(s) for translatable strings...`);
        const entries = scanPluginDirs(dirs);
        logger.info(`Found ${entries.length} translatable string(s)`);

        if (entries.length === 0) {
          console.log("No translatable strings found.");
          return;
        }

        logger.info(`Warming cache for languages: ${langs.join(", ")}...`);
        const { translated, errors, failedStrings } = await warmCache(
          entries,
          langs,
          (done, total) => {
            if (done % 10 === 0 || done === total) {
              process.stdout.write(`\r  Progress: ${done}/${total}`);
            }
          },
          (text, lang, err) => {
            logger.warn(`Failed to translate "${text}" → ${lang}: ${err}`);
          },
        );
        console.log(
          `\nDone. Translated: ${translated}, Errors: ${errors}`,
        );
        if (failedStrings.length > 0) {
          console.log("Failed strings:");
          for (const f of failedStrings.slice(0, 10)) {
            console.log(`  "${f.text}" → ${f.lang}: ${f.error}`);
          }
          if (failedStrings.length > 10) {
            console.log(`  ... and ${failedStrings.length - 10} more`);
          }
        }
      } catch (err) {
        logger.error(`warm failed: ${err}`);
        process.exit(1);
      }
    });

  // ── stats ──────────────────────────────────────────────────────────
  td.command("stats")
    .description("Show translation cache statistics")
    .action(async () => {
      try {
        await initClient(cfg);
        const store = getStore();
        if (!store) {
          logger.error("Translation store not initialized");
          process.exit(1);
        }
        const stats = await store.stats();
        console.log("Translation Cache Statistics");
        console.log("────────────────────────────");
        console.log(`Total translations: ${stats.totalTranslations}`);
        console.log(`Total failed:       ${stats.totalFailed}`);
        if (Object.keys(stats.byLanguage).length > 0) {
          console.log("\nBy language:");
          for (const [lang, count] of Object.entries(stats.byLanguage)) {
            console.log(`  ${lang}: ${count}`);
          }
        }
      } catch (err) {
        logger.error(`stats failed: ${err}`);
        process.exit(1);
      }
    });

  // ── clear ──────────────────────────────────────────────────────────
  td.command("clear")
    .description("Clear translation cache")
    .option("--failed-only", "Only clear failed translations")
    .option("--lang <lang>", "Only clear translations for a specific language")
    .action(async (opts: { failedOnly?: boolean; lang?: string }) => {
      try {
        await initClient(cfg);
        const store = getStore();
        if (!store) {
          logger.error("Translation store not initialized");
          process.exit(1);
        }
        const lang = opts.lang?.toUpperCase();
        const deleted = await store.clear(lang, opts.failedOnly);
        console.log(
          `Cleared ${deleted} translation(s)${opts.failedOnly ? " (failed only)" : ""}${lang ? ` for ${lang}` : ""}`,
        );
      } catch (err) {
        logger.error(`clear failed: ${err}`);
        process.exit(1);
      }
    });

  // ── langs ──────────────────────────────────────────────────────────
  td.command("langs")
    .description("List configured target languages")
    .action(() => {
      console.log(`Source:  ${cfg.defaultSourceLang}`);
      console.log(`Targets: ${cfg.defaultTargetLangs.join(", ")}`);
    });

  // ── config ─────────────────────────────────────────────────────────
  td.command("config")
    .description("Show current transduck configuration")
    .action(() => {
      console.log("Transduck Configuration");
      console.log("───────────────────────");
      console.log(`DB directory:    ${cfg.dbDir}`);
      console.log(`Provider:        ${cfg.provider}`);
      console.log(`API key env:     ${cfg.apiKeyEnv}`);
      console.log(`Backend model:   ${cfg.backendModel}`);
      console.log(`Source language:  ${cfg.defaultSourceLang}`);
      console.log(`Target languages: ${cfg.defaultTargetLangs.join(", ")}`);
    });
}
