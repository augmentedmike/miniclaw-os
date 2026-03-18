/**
 * mc-memo — Agent tool definitions
 *
 * Uses spawnSync to call the openclaw mc-memo CLI.
 * Simple, no in-process state needed — just file I/O.
 */

import { spawnSync } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import type { AnyAgentTool } from "openclaw/plugin-sdk";
import type { Logger } from "pino";

function schema(props: Record<string, unknown>, required?: string[]): unknown {
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
  return { content: [{ type: "text" as const, text: text.trim() }], details: {} };
}

function toolErr(text: string) {
  return {
    content: [{ type: "text" as const, text: text.trim() }],
    isError: true,
    details: {},
  };
}

function runMemo(args: string[]): { stdout: string; stderr: string; exitCode: number } {
  const result = spawnSync("openclaw", ["mc-memo", ...args], {
    encoding: "utf-8",
    timeout: 10000,
  });
  return {
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
    exitCode: result.status ?? 1,
  };
}

export function createMemoTools(memoDir: string, logger: Logger): AnyAgentTool[] {
  return [
    {
      name: "memo_write",
      label: "Memo Write",
      description:
        "Append a timestamped note to the card's scratchpad memo file. " +
        "Use this to record: failed approaches ('tried X, got error Y, do not retry'), " +
        "completed irreversible steps ('DB migrated, do not re-run'), " +
        "and env conflicts ('TURBOPACK=1 breaks build, must unset'). " +
        "READ memos at the start of each session to avoid repeating failures.",
      parameters: schema(
        {
          cardId: str("Card ID (e.g. crd_d1908fb6)"),
          note: str("Note to record — be specific so future sessions understand what was tried and why it failed/succeeded"),
        },
        ["cardId", "note"],
      ) as never,
      execute: async (_toolCallId: string, input: { cardId: string; note: string }) => {
        logger.debug(`mc-memo/tool memo_write: cardId=${input.cardId}`);
        try {
          fs.mkdirSync(memoDir, { recursive: true });
          const filePath = path.join(memoDir, `${input.cardId}.md`);
          const timestamp = new Date().toISOString();
          const line = `${timestamp} ${input.note}\n`;
          fs.appendFileSync(filePath, line, { encoding: "utf-8", flag: "a" });
          return ok(`Memo written: ${timestamp} ${input.note}`);
        } catch (e: unknown) {
          const msg = e instanceof Error ? e.message : String(e);
          logger.error(`mc-memo/tool memo_write error: ${msg}`);
          return toolErr(`memo_write failed: ${msg}`);
        }
      },
    },

    {
      name: "memo_read",
      label: "Memo Read",
      description:
        "Read all scratchpad notes for a card. " +
        "ALWAYS call this at the start of a session on a card to recover prior context: " +
        "failed approaches, completed steps, env conflicts. " +
        "Returns '(no memos yet)' if no notes have been written.",
      parameters: schema(
        {
          cardId: str("Card ID (e.g. crd_d1908fb6)"),
        },
        ["cardId"],
      ) as never,
      execute: async (_toolCallId: string, input: { cardId: string }) => {
        logger.debug(`mc-memo/tool memo_read: cardId=${input.cardId}`);
        try {
          const filePath = path.join(memoDir, `${input.cardId}.md`);
          if (!fs.existsSync(filePath)) return ok("(no memos yet)");
          const content = fs.readFileSync(filePath, "utf-8");
          if (!content.trim()) return ok("(no memos yet)");
          return ok(content);
        } catch (e: unknown) {
          const msg = e instanceof Error ? e.message : String(e);
          logger.error(`mc-memo/tool memo_read error: ${msg}`);
          return toolErr(`memo_read failed: ${msg}`);
        }
      },
    },
  ];
}
