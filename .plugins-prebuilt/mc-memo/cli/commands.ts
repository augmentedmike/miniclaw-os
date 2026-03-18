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

  // ---- mc-memo write ----
  memo
    .command("write <cardId> <note>")
    .description("Append a timestamped note to the card's memo file")
    .action((cardId: string, note: string) => {
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
    });

  // ---- mc-memo read ----
  memo
    .command("read <cardId>")
    .description("Print all memo notes for a card")
    .action((cardId: string) => {
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
    });
}
