import { NextResponse } from "next/server";
import Database from "better-sqlite3";
import * as path from "node:path";
import * as fs from "node:fs";
import * as os from "node:os";

export const dynamic = "force-dynamic";

const EMPTY = { total_runs: 0, total_tokens: 0, avg_tokens_per_card: 0, avg_duration_ms: 0, total_cost_usd: 0, subscription_cost_usd: 0, plan: "pro", multiplier: 1 };

function getDiscountFactor(): { plan: string; multiplier: number; discount: number } {
  const tiers: Record<string, { plan: string; mult: number }> = {
    "default_claude_pro":     { plan: "Pro ($20)", mult: 1 },
    "default_claude_max_5x":  { plan: "Max 5x ($100)", mult: 5 },
    "default_claude_max_20x": { plan: "Max 20x ($200)", mult: 20 },
  };
  try {
    const { execSync } = require("node:child_process");
    const raw = execSync('security find-generic-password -s "Claude Code-credentials" -w', {
      encoding: "utf-8", timeout: 5000, stdio: ["pipe", "pipe", "pipe"],
    }).trim();
    const oauth = JSON.parse(raw)?.claudeAiOauth ?? {};
    const tier = oauth.rateLimitTier ?? "default_claude_pro";
    const info = tiers[tier] ?? tiers["default_claude_pro"];
    return { plan: info.plan, multiplier: info.mult, discount: 1 / info.mult };
  } catch { // keychain lookup failed — no Claude credentials or macOS security unavailable
    return { plan: "Pro ($20)", multiplier: 1, discount: 1 };
  }
}

export async function GET() {
  const stateDir = process.env.OPENCLAW_STATE_DIR ?? path.join(os.homedir(), ".openclaw");
  const dbPath = process.env.BOARD_DB_PATH ?? path.join(stateDir, "USER", "brain", "board.db");
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
    const { plan, multiplier, discount } = getDiscountFactor();
    const apiCost = row.total_cost_usd;
    const subscriptionCost = apiCost * discount;

    return NextResponse.json({
      total_runs: row.total_runs,
      total_tokens: row.total_tokens,
      avg_tokens_per_card: Math.round(row.avg_tokens_per_card),
      avg_duration_ms: Math.round(row.avg_duration_ms),
      total_cost_usd: Math.round(apiCost * 10000) / 10000,
      subscription_cost_usd: Math.round(subscriptionCost * 10000) / 10000,
      plan,
      multiplier,
    });
  } catch { // DB open or query failed — return empty stats
    return NextResponse.json(EMPTY);
  }
}
