/**
 * mc-kb — CLI commands
 *
 * openclaw mc-kb add|search|list|get|update|rm|import|stats
 */

import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import * as net from "node:net";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import type { Command } from "commander";
import type { KBStore } from "../src/store.js";
import type { Embedder } from "../src/embedder.js";
import { hybridSearch } from "../src/search.js";

const __filename_cli = fileURLToPath(import.meta.url);
const __dirname_cli = path.dirname(__filename_cli);
import { validateType, VALID_TYPES, type KBEntryCreate, entryToMarkdown } from "../src/entry.js";

export interface CliContext {
  program: Command;
  logger: { info: (m: string) => void; warn: (m: string) => void; error: (m: string) => void };
}

export function registerKbCommands(
  ctx: CliContext,
  store: KBStore,
  embedder: Embedder,
): void {
  const { program } = ctx;

  const kb = program
    .command("mc-kb")
    .description("Miniclaw Knowledge Base — long-term semantic memory")
    .addHelpText("after", `
Entry types: ${VALID_TYPES.join(", ")}

Examples:
  openclaw mc-kb add --type error --title "SSL cert fails on M1" --content "Use security add-trusted-cert" --tags ssl,macos
  openclaw mc-kb search "ssl certificate mac"
  openclaw mc-kb list --type error
  openclaw mc-kb get kb_a1b2c3d4
  openclaw mc-kb stats`);

  // ---- mc-kb add ----
  kb
    .command("add")
    .description("Add a new knowledge base entry")
    .requiredOption("--type <type>", `Entry type: ${VALID_TYPES.join(", ")}`)
    .requiredOption("--title <title>", "Entry title")
    .requiredOption("--content <content>", "Entry content (markdown)")
    .option("--summary <summary>", "Short summary (1-2 sentences)")
    .option("--tags <tags>", "Comma-separated tags")
    .option("--source <source>", "Source: 'conversation', 'cli', url, or file path")
    .option("--severity <severity>", "Severity (for error/postmortem): low, medium, high")
    .action(async (opts: {
      type: string; title: string; content: string;
      summary?: string; tags?: string; source?: string; severity?: string;
    }) => {
      try {
        const type = validateType(opts.type);
        const tags = opts.tags ? opts.tags.split(",").map((t) => t.trim()).filter(Boolean) : [];

        const entryCreate: KBEntryCreate = {
          type,
          title: opts.title,
          content: opts.content,
          summary: opts.summary,
          tags,
          source: opts.source,
          severity: opts.severity as KBEntryCreate["severity"],
        };

        // Get embedding if available
        const vector = await embedder.embed(opts.title + "\n" + opts.content);

        const entry = store.add(entryCreate, vector ?? undefined);
        console.log(`Added ${entry.id}: ${entry.title}`);
        if (!embedder.isReady()) {
          console.log("  (note: embedder not ready — FTS5-only search for this entry)");
        }
      } catch (err) {
        console.error(`Error: ${err instanceof Error ? err.message : err}`);
        process.exit(1);
      }
    });

  // ---- mc-kb search ----
  kb
    .command("search <query>")
    .description("Hybrid vector+keyword search")
    .option("--type <type>", "Filter by type")
    .option("--tag <tag>", "Filter by tag")
    .option("-n, --n <n>", "Number of results", "10")
    .option("--json", "Output as JSON")
    .action(async (query: string, opts: { type?: string; tag?: string; n: string; json?: boolean }) => {
      try {
        const n = parseInt(opts.n, 10) || 10;
        const results = await hybridSearch(store, embedder, query, {
          n, type: opts.type, tag: opts.tag,
        });

        if (results.length === 0) {
          console.log("No results found.");
          return;
        }

        if (opts.json) {
          console.log(JSON.stringify(results.map((r) => ({
            ...r.entry,
            _score: r.score,
            _vecDistance: r.vecDistance,
          })), null, 2));
          return;
        }

        console.log(`\nFound ${results.length} result(s) for "${query}":\n`);
        for (const r of results) {
          const e = r.entry;
          const tags = e.tags.length ? ` [${e.tags.join(", ")}]` : "";
          const sevStr = e.severity ? ` (${e.severity})` : "";
          const vecStr = r.vecDistance !== undefined ? ` vec=${r.vecDistance.toFixed(3)}` : "";
          console.log(`  ${e.id}  [${e.type}]${sevStr}  ${e.title}${tags}`);
          console.log(`    score=${r.score.toFixed(4)}${vecStr}`);
          if (e.summary) {
            console.log(`    > ${e.summary}`);
          } else {
            const preview = e.content.slice(0, 100).replace(/\n/g, " ");
            console.log(`    > ${preview}${e.content.length > 100 ? "..." : ""}`);
          }
          console.log();
        }
      } catch (err) {
        console.error(`Error: ${err instanceof Error ? err.message : err}`);
        process.exit(1);
      }
    });

  // ---- mc-kb list ----
  kb
    .command("list")
    .description("List knowledge base entries")
    .option("--type <type>", "Filter by type")
    .option("--tag <tag>", "Filter by tag")
    .option("--limit <n>", "Max entries to show", "20")
    .option("--json", "Output as JSON")
    .action((opts: { type?: string; tag?: string; limit: string; json?: boolean }) => {
      const limit = parseInt(opts.limit, 10) || 20;
      const entries = store.list({ type: opts.type, tag: opts.tag, limit });

      if (entries.length === 0) {
        console.log("No entries found.");
        return;
      }

      if (opts.json) {
        console.log(JSON.stringify(entries, null, 2));
        return;
      }

      console.log(`\n${"ID".padEnd(12)} ${"TYPE".padEnd(12)} ${"TAGS".padEnd(20)} TITLE`);
      console.log("─".repeat(80));
      for (const e of entries) {
        const tags = e.tags.slice(0, 3).join(", ");
        console.log(
          `${e.id.padEnd(12)} ${e.type.padEnd(12)} ${tags.padEnd(20)} ${e.title.slice(0, 40)}`
        );
      }
      console.log(`\n${entries.length} entr${entries.length === 1 ? "y" : "ies"}`);
    });

  // ---- mc-kb get ----
  kb
    .command("get <id>")
    .description("Get full entry by ID")
    .option("--json", "Output as JSON")
    .action((id: string, opts: { json?: boolean }) => {
      const entry = store.get(id);
      if (!entry) {
        console.error(`Entry not found: ${id}`);
        process.exit(1);
      }
      if (opts.json) {
        console.log(JSON.stringify(entry, null, 2));
        return;
      }
      console.log(entryToMarkdown(entry));
    });

  // ---- mc-kb update ----
  kb
    .command("update <id>")
    .description("Update an existing entry")
    .option("--type <type>", "New type")
    .option("--title <title>", "New title")
    .option("--content <content>", "New content")
    .option("--summary <summary>", "New summary")
    .option("--tags <tags>", "New tags (comma-separated, replaces existing)")
    .option("--severity <severity>", "New severity")
    .action(async (id: string, opts: {
      type?: string; title?: string; content?: string;
      summary?: string; tags?: string; severity?: string;
    }) => {
      try {
        const patch: Record<string, unknown> = {};
        if (opts.type) patch.type = validateType(opts.type);
        if (opts.title) patch.title = opts.title;
        if (opts.content) patch.content = opts.content;
        if (opts.summary) patch.summary = opts.summary;
        if (opts.tags) patch.tags = opts.tags.split(",").map((t) => t.trim()).filter(Boolean);
        if (opts.severity) patch.severity = opts.severity;

        if (Object.keys(patch).length === 0) {
          console.error("No fields to update specified.");
          process.exit(1);
        }

        // Re-embed if title or content changed
        let vector: Float32Array | undefined;
        if (opts.title || opts.content) {
          const existing = store.get(id);
          if (existing) {
            const title = (opts.title ?? existing.title);
            const content = (opts.content ?? existing.content);
            const v = await embedder.embed(title + "\n" + content);
            vector = v ?? undefined;
          }
        }

        const updated = store.update(id, patch, vector);
        console.log(`Updated ${updated.id}: ${updated.title}`);
      } catch (err) {
        console.error(`Error: ${err instanceof Error ? err.message : err}`);
        process.exit(1);
      }
    });

  // ---- mc-kb rm ----
  kb
    .command("rm <id>")
    .description("Remove an entry")
    .action((id: string) => {
      const entry = store.get(id);
      if (!entry) {
        console.error(`Entry not found: ${id}`);
        process.exit(1);
      }
      store.remove(id);
      console.log(`Removed ${id}: ${entry.title}`);
    });

  // ---- mc-kb import ----
  kb
    .command("import <file>")
    .description("Bulk import: YAML frontmatter + markdown body")
    .action(async (file: string) => {
      const absFile = path.resolve(file);
      if (!fs.existsSync(absFile)) {
        console.error(`File not found: ${absFile}`);
        process.exit(1);
      }
      const raw = fs.readFileSync(absFile, "utf-8");

      // Split on --- separators to get multiple documents
      const docs = raw.split(/^---$/m).filter((d) => d.trim());

      // Parse pairs: frontmatter + body
      let imported = 0;
      let i = 0;
      while (i < docs.length) {
        try {
          const frontmatter = docs[i].trim();
          const body = docs[i + 1]?.trim() ?? "";
          i += 2;

          const entry = parseFrontmatter(frontmatter, body);
          const vector = await embedder.embed(entry.title + "\n" + entry.content);
          store.add(entry, vector ?? undefined);
          imported++;
          console.log(`  Imported ${entry.title}`);
        } catch (err) {
          console.warn(`  Skip: ${err instanceof Error ? err.message : err}`);
          i++;
        }
      }
      console.log(`\nImported ${imported} entr${imported === 1 ? "y" : "ies"} from ${absFile}`);
    });

  // ---- mc-kb stats ----
  kb
    .command("stats")
    .description("Count entries by type")
    .action(() => {
      const stats = store.stats();
      console.log("\nKnowledge Base Stats:");
      console.log(`  Total: ${stats.total ?? 0}`);
      for (const type of VALID_TYPES) {
        if (stats[type]) {
          console.log(`  ${type.padEnd(12)}: ${stats[type]}`);
        }
      }
      console.log(`  Vector search: ${store.isVecLoaded() ? "enabled" : "disabled (FTS5-only)"}`);
    });

  // ---- mc-kb embedder ----
  const embedderCmd = kb
    .command("embedder")
    .description("Manage the embedding daemon (LaunchAgent)");

  const STATE_DIR = process.env.OPENCLAW_STATE_DIR ?? path.join(os.homedir(), ".openclaw");
  const SOCK_PATH = path.join(STATE_DIR, "run", "embedder.sock");
  const PID_PATH = path.join(STATE_DIR, "run", "embedder.pid");
  const PLIST_NAME = "com.miniclaw.embedder";
  const PLIST_SRC = path.join(__dirname_cli, "..", "com.miniclaw.embedder.plist");
  const PLIST_DEST = path.join(os.homedir(), "Library", "LaunchAgents", `${PLIST_NAME}.plist`);
  const GUI_DOMAIN = `gui/${process.getuid?.() ?? 501}`;

  embedderCmd
    .command("start")
    .description("Install and start the embedding daemon via LaunchAgent")
    .action(() => {
      try {
        // Copy plist to LaunchAgents
        if (!fs.existsSync(PLIST_SRC)) {
          console.error(`Plist not found: ${PLIST_SRC}`);
          process.exit(1);
        }
        fs.mkdirSync(path.dirname(PLIST_DEST), { recursive: true });
        fs.copyFileSync(PLIST_SRC, PLIST_DEST);
        console.log(`Installed ${PLIST_DEST}`);

        // Load the LaunchAgent
        try {
          execSync(`launchctl bootout ${GUI_DOMAIN} ${PLIST_DEST} 2>/dev/null`, { stdio: "ignore" });
        } catch {}
        execSync(`launchctl bootstrap ${GUI_DOMAIN} ${PLIST_DEST}`, { stdio: "inherit" });
        console.log("Embedding daemon started.");
      } catch (err) {
        console.error(`Failed to start daemon: ${(err as Error).message}`);
        process.exit(1);
      }
    });

  embedderCmd
    .command("stop")
    .description("Stop and unload the embedding daemon")
    .action(() => {
      try {
        execSync(`launchctl bootout gui/$(id -u) ${PLIST_DEST}`, { stdio: "inherit" });
        console.log("Embedding daemon stopped.");
      } catch (err) {
        console.error(`Failed to stop daemon: ${(err as Error).message}`);
      }
      // Clean up socket and pid
      try { fs.unlinkSync(SOCK_PATH); } catch {}
      try { fs.unlinkSync(PID_PATH); } catch {}
    });

  embedderCmd
    .command("status")
    .description("Check embedding daemon status")
    .action(async () => {
      // Check PID file
      let pid: string | null = null;
      try {
        pid = fs.readFileSync(PID_PATH, "utf-8").trim();
      } catch {}

      // Check if process is alive
      let processAlive = false;
      if (pid) {
        try {
          process.kill(Number(pid), 0);
          processAlive = true;
        } catch {}
      }

      // Check socket
      const socketExists = fs.existsSync(SOCK_PATH);

      // Ping daemon
      let pingOk = false;
      if (socketExists) {
        try {
          pingOk = await new Promise<boolean>((resolve) => {
            const conn = net.createConnection(SOCK_PATH);
            const timer = setTimeout(() => { conn.destroy(); resolve(false); }, 2000);
            conn.on("connect", () => {
              conn.write(JSON.stringify({ id: "status-check", ping: true }) + "\n");
            });
            conn.on("data", (chunk) => {
              clearTimeout(timer);
              conn.destroy();
              try {
                const resp = JSON.parse(chunk.toString().trim());
                resolve(resp.pong === true);
              } catch {
                resolve(false);
              }
            });
            conn.on("error", () => { clearTimeout(timer); resolve(false); });
          });
        } catch {}
      }

      // Check LaunchAgent
      let launchAgentLoaded = false;
      try {
        const out = execSync(`launchctl print ${GUI_DOMAIN}/${PLIST_NAME} 2>&1`, { encoding: "utf-8" });
        launchAgentLoaded = out.includes("state =");
      } catch {}

      console.log("\nEmbedding Daemon Status:");
      console.log(`  PID:          ${pid ?? "none"} ${processAlive ? "(alive)" : pid ? "(dead)" : ""}`);
      console.log(`  Socket:       ${socketExists ? SOCK_PATH : "not found"}`);
      console.log(`  Ping:         ${pingOk ? "OK ✓" : "no response ✗"}`);
      console.log(`  LaunchAgent:  ${launchAgentLoaded ? "loaded ✓" : "not loaded ✗"}`);
      console.log();

      if (pingOk) {
        console.log("  Daemon is running and healthy.");
      } else if (processAlive) {
        console.log("  Daemon process exists but not responding — may still be loading model.");
      } else {
        console.log("  Daemon is not running. Start with: openclaw mc-kb embedder start");
      }
    });
}

// ---- Helper: parse YAML-lite frontmatter ----

function parseFrontmatter(fm: string, body: string): KBEntryCreate {
  const lines = fm.split("\n");
  const kv: Record<string, string> = {};
  for (const line of lines) {
    const m = line.match(/^(\w+):\s*(.+)$/);
    if (m) kv[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
  }

  const type = validateType(kv.type ?? "fact");
  const title = kv.title ?? "Untitled";
  const tags = kv.tags
    ? kv.tags.replace(/[\[\]"]/g, "").split(",").map((t) => t.trim()).filter(Boolean)
    : [];

  // Strip h1 from body if it matches title
  const content = body.replace(/^#\s+.+\n?\n?/, "").trim() || body;

  return {
    type,
    title,
    content: content || "No content",
    summary: kv.summary,
    tags,
    source: kv.source,
    severity: kv.severity as KBEntryCreate["severity"],
    id: kv.id?.startsWith("kb_") ? kv.id : undefined,
  };
}
