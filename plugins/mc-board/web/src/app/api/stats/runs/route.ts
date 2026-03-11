import { NextResponse } from "next/server";
import Database from "better-sqlite3";
import * as path from "node:path";
import * as fs from "node:fs";
import * as os from "node:os";

export const dynamic = "force-dynamic";

const EMPTY = { total_runs: 0, total_tokens: 0, avg_tokens_per_card: 0, avg_duration_ms: 0, total_cost_usd: 0 };

export async function GET() {
  const stateDir = process.env.OPENCLAW_STATE_DIR ?? path.join(os.homedir(), ".miniclaw");
  const dbPath = process.env.BOARD_DB_PATH ?? path.join(stateDir, "user/augmentedmike_bot/brain/board.db");
  if (!fs.existsSync(dbPath)) return NextResponse.json(EMPTY);
  try {
    const db = new Database(dbPath, { readonly: true });
    const tableExists = db.prepare(
      `SELECT name FROM sqlite_master WHERE type='table' AND name='agent_runs'`,
    ).get();
    if (!tableExists) { db.close(); return NextResponse.json(EMPTY); }
    const row = db.prepare(`
      SELECT
        COUNT(*) as total_runs,
        COALESCE(SUM(total_tokens), 0) as total_tokens,
        COALESCE(AVG(total_tokens), 0) as avg_tokens_per_card,
        COALESCE(AVG(duration_ms), 0) as avg_duration_ms,
        COALESCE(SUM(cost_usd), 0) as total_cost_usd
      FROM agent_runs
    `).get() as { total_runs: number; total_tokens: number; avg_tokens_per_card: number; avg_duration_ms: number; total_cost_usd: number };
    db.close();
    return NextResponse.json({
      total_runs: row.total_runs,
      total_tokens: row.total_tokens,
      avg_tokens_per_card: Math.round(row.avg_tokens_per_card),
      avg_duration_ms: Math.round(row.avg_duration_ms),
      total_cost_usd: Math.round(row.total_cost_usd * 100) / 100,
    });
  } catch {
    return NextResponse.json(EMPTY);
  }
}
