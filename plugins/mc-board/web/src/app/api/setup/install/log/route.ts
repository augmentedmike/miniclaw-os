export const dynamic = "force-dynamic";

import * as fs from "node:fs";
import * as path from "node:path";

const LOG_FILE = "/tmp/miniclaw-install.log";
const DONE_MARKER = "miniclaw-os installed.";

/**
 * GET /api/setup/install/log?offset=N
 *
 * Tails the install log file. Returns new lines since offset.
 * The overlay polls this every 2s to show live install output.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const offset = parseInt(url.searchParams.get("offset") || "0", 10);

  try {
    if (!fs.existsSync(LOG_FILE)) {
      return Response.json({ lines: [], offset: 0, done: false });
    }

    const content = fs.readFileSync(LOG_FILE, "utf-8");
    const allLines = content.split("\n");
    const newLines = allLines.slice(offset);
    const done = content.includes(DONE_MARKER);

    // Strip ANSI codes server-side
    const cleaned = newLines
      .filter((l) => l.length > 0)
      .map((l) => l.replace(/\x1b\[[0-9;]*m/g, ""));

    return Response.json({
      lines: cleaned,
      offset: allLines.length,
      done,
    });
  } catch { // log file read failed — return empty state
    return Response.json({ lines: [], offset: 0, done: false });
  }
}
