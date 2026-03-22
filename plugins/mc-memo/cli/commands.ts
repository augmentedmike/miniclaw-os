/**
 * mc-memo — CLI commands
 *
 * openclaw mc-memo write <cardId> <note>   Append timestamped note to per-card memo file
 * openclaw mc-memo read <cardId>           Print all notes for that card
 */

import * as fs from "node:fs";
import * as path from "node:path";
import type { Command } from "commander";

export interface CliContext {
  program: Command;
  logger: { info: (m: string) => void; warn: (m: string) => void; error: (m: string) => void };
}

export function registerMemoCommands(ctx: CliContext, memoDir: string): void {
  const { program } = ctx;

  const memo = program
    .command("mc-memo")
    .description("Short-term working memory — per-card scratchpad for agent runs");

  // ---- mc-memo write / set ----
  const writeAction = (cardId: string, note: string) => {
    try {
      fs.mkdirSync(memoDir, { recursive: true });
      const filePath = path.join(memoDir, `${cardId}.md`);
      const timestamp = new Date().toISOString();
      const line = `${timestamp} ${note}\n`;
      fs.appendFileSync(filePath, line, { encoding: "utf-8", flag: "a" });
      console.log(`Memo written to ${filePath}`);
    } catch (err) {
      console.error(`Error: ${err instanceof Error ? err.message : err}`);
      process.exit(1);
    }
  };

  memo
    .command("write <cardId> <note>")
    .description("Append a timestamped note to the card's memo file")
    .action(writeAction);

  memo
    .command("set <cardId> <note>")
    .description("Alias for write — append a timestamped note to the card's memo file")
    .action(writeAction);

  // ---- mc-memo read / get ----
  const readAction = (cardId: string) => {
    try {
      const filePath = path.join(memoDir, `${cardId}.md`);
      if (!fs.existsSync(filePath)) {
        console.log("(no memos yet)");
        return;
      }
      const content = fs.readFileSync(filePath, "utf-8");
      if (!content.trim()) {
        console.log("(no memos yet)");
        return;
      }
      console.log(content);
    } catch (err) {
      console.error(`Error: ${err instanceof Error ? err.message : err}`);
      process.exit(1);
    }
  };

  memo
    .command("read <cardId>")
    .description("Print all memo notes for a card")
    .action(readAction);

  memo
    .command("get <cardId>")
    .description("Alias for read — print all memo notes for a card")
    .action(readAction);

  // ---- mc-memo clear ----
  memo
    .command("clear <cardId>")
    .description("Remove the memo file for a card")
    .action((cardId: string) => {
      try {
        const filePath = path.join(memoDir, `${cardId}.md`);
        if (!fs.existsSync(filePath)) {
          console.log("(no memos for this card)");
          return;
        }
        fs.unlinkSync(filePath);
        console.log(`Memo cleared: ${filePath}`);
      } catch (err) {
        console.error(`Error: ${err instanceof Error ? err.message : err}`);
        process.exit(1);
      }
    });

  // ---- mc-memo list ----
  memo
    .command("list")
    .description("List all memo files with previews")
    .option("--json", "Output as JSON")
    .action((opts: { json?: boolean }) => {
      try {
        if (!fs.existsSync(memoDir)) {
          console.log("No memos found.");
          return;
        }

        const files = fs.readdirSync(memoDir)
          .filter((f: string) => f.endsWith(".md"))
          .sort();

        if (files.length === 0) {
          console.log("No memos found.");
          return;
        }

        if (opts.json) {
          const entries = files.map((file: string) => {
            const content = fs.readFileSync(path.join(memoDir, file), "utf-8");
            const lines = content.trim().split("\n").filter((l: string) => l.trim());
            const lastLine = lines.length > 0 ? lines[lines.length - 1] : "";
            return {
              file,
              cardId: file.replace(/\.md$/, ""),
              lines: lines.length,
              preview: lastLine.slice(0, 120).replace(/\n/g, " "),
            };
          });
          console.log(JSON.stringify(entries, null, 2));
          return;
        }

        for (const file of files) {
          const cardId = file.replace(/\.md$/, "");
          const content = fs.readFileSync(path.join(memoDir, file), "utf-8");
          const lines = content.trim().split("\n").filter((l: string) => l.trim());
          const lastLine = lines.length > 0 ? lines[lines.length - 1] : "(empty)";
          console.log(`[${cardId}] (${lines.length} entries)`);
          console.log(`  ${lastLine.slice(0, 120).replace(/\n/g, " ")}`);
          console.log();
        }
      } catch (err) {
        console.error(`Error: ${err instanceof Error ? err.message : err}`);
        process.exit(1);
      }
    });
}
