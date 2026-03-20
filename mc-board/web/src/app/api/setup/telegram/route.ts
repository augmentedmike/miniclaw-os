import { NextResponse } from "next/server";
import { writeSetupState, isSetupComplete } from "@/lib/setup-state";
import { consumeToken } from "@/lib/sensitive-auth";

export async function POST(req: Request) {
  const { botToken, chatId, botUsername, sensitiveToken } = await req.json();

  if (isSetupComplete() && !consumeToken(sensitiveToken)) {
    return NextResponse.json(
      { ok: false, error: "Password confirmation required" },
      { status: 403 },
    );
  }

  if (!botToken || !chatId) {
    return NextResponse.json(
      { ok: false, error: "Bot token and chat ID are required" },
      { status: 400 },
    );
  }

  try {
    // Send a test message via the Telegram Bot API
    const res = await fetch(
      `https://api.telegram.org/bot${botToken}/sendMessage`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: chatId,
          text: "Hello from AM Setup! Your Telegram connection is working.",
        }),
      },
    );
    const data = await res.json();

    if (!data.ok) {
      return NextResponse.json({
        ok: false,
        error: data.description || "Telegram API error",
      });
    }

    // Save to state
    writeSetupState({
      telegramBotUsername: botUsername,
      telegramBotToken: botToken,
      telegramChatId: chatId,
    } as Record<string, string>);

    return NextResponse.json({ ok: true, chatId });
  } catch (e) {
    return NextResponse.json({
      ok: false,
      error: `Connection failed: ${e instanceof Error ? e.message : "unknown"}`,
    });
  }
}
