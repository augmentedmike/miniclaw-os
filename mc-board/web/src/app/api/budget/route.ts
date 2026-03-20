import { NextResponse } from "next/server";
import { execSync } from "node:child_process";

export const dynamic = "force-dynamic";

// Subscription tiers from Claude credentials
// subscriptionType + rateLimitTier → discount factor
const TIER_MAP: Record<string, { price: number; multiplier: number }> = {
  "default_claude_pro":      { price: 20,  multiplier: 1 },
  "default_claude_max_5x":   { price: 100, multiplier: 5 },
  "default_claude_max_20x":  { price: 200, multiplier: 20 },
};

function getSubscription(): { plan: string; tier: string; price: number; multiplier: number; discount_factor: number } {
  try {
    const raw = execSync('security find-generic-password -s "Claude Code-credentials" -w', {
      encoding: "utf-8", timeout: 5000, stdio: ["pipe", "pipe", "pipe"],
    }).trim();
    const creds = JSON.parse(raw);
    const oauth = creds?.claudeAiOauth ?? {};
    const sub = oauth.subscriptionType ?? "pro";
    const tier = oauth.rateLimitTier ?? "default_claude_pro";
    const info = TIER_MAP[tier] ?? TIER_MAP["default_claude_pro"];
    return {
      plan: sub,
      tier,
      price: info.price,
      multiplier: info.multiplier,
      discount_factor: 1 / info.multiplier,
    };
  } catch {
    return { plan: "pro", tier: "default_claude_pro", price: 20, multiplier: 1, discount_factor: 1 };
  }
}

export function GET() {
  return NextResponse.json(getSubscription());
}
