export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { readSetupState, writeSetupState } from "@/lib/setup-state";
import { vaultSet } from "@/lib/vault";

/**
 * POST /api/setup/persist
 *
 * Called after install.sh completes. Moves all secrets from setup-state.json
 * into the vault (which now exists because install.sh created it).
 */
export async function POST() {
  const state = readSetupState();
  const results: { key: string; ok: boolean; error?: string }[] = [];

  const persist = (key: string, vaultKey: string) => {
    const value = (state as Record<string, string>)[key];
    if (!value) return;
    const r = vaultSet(vaultKey, value);
    results.push({ key: vaultKey, ok: r.ok, error: r.error });
  };

  // Telegram
  persist("telegramBotToken", "telegram-bot-token");

  // GitHub
  persist("ghToken", "gh-token");

  // Email
  persist("emailAppPassword", "gmail-app-password");
  if (state.emailAddress) {
    vaultSet("gmail-email", state.emailAddress);
  }
  if ((state as Record<string, string>).emailSmtpHost) {
    vaultSet("smtp-host", (state as Record<string, string>).emailSmtpHost);
    vaultSet("smtp-port", (state as Record<string, string>).emailSmtpPort || "587");
  }

  // Gemini
  persist("geminiApiKey", "gemini-api-key");

  // Mark as persisted
  writeSetupState({ secretsPersisted: true } as Record<string, string | boolean>);

  const failed = results.filter((r) => !r.ok);

  return NextResponse.json({
    ok: failed.length === 0,
    results,
    failed: failed.length,
  });
}
