"use client";

import { useState } from "react";

interface Props {
  botUsername: string;
  botToken: string;
  chatId: string;
  onChange: (p: {
    telegramBotUsername?: string;
    telegramBotToken?: string;
    telegramChatId?: string;
  }) => void;
  onNext: () => void;
  onBack: () => void;
  accent: string;
}

type Status = "idle" | "testing" | "ok" | "error";

export default function StepTelegram({
  botUsername,
  botToken,
  chatId,
  onChange,
  onNext,
  onBack,
  accent,
}: Props) {
  const [usernameInput, setUsernameInput] = useState(botUsername);
  const [tokenInput, setTokenInput] = useState(botToken);
  const [chatIdInput, setChatIdInput] = useState(chatId);
  const [status, setStatus] = useState<Status>("idle");
  const [errorMsg, setErrorMsg] = useState("");

  const handleTest = async () => {
    if (!tokenInput.trim() || !chatIdInput.trim()) {
      setErrorMsg("Bot token and chat ID are both required");
      return;
    }
    setStatus("testing");
    setErrorMsg("");

    try {
      const res = await fetch("/api/setup/telegram", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          botToken: tokenInput.trim(),
          chatId: chatIdInput.trim(),
          botUsername: usernameInput.trim(),
        }),
      });
      const data = await res.json();
      if (data.ok) {
        onChange({
          telegramBotUsername: usernameInput.trim(),
          telegramBotToken: tokenInput.trim(),
          telegramChatId: chatIdInput.trim(),
        });
        setStatus("ok");
        setTimeout(onNext, 1000);
      } else {
        setStatus("error");
        setErrorMsg(data.error || "Could not send test message");
      }
    } catch {
      setStatus("error");
      setErrorMsg("Network error — is the server running?");
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="text-3xl font-bold text-white mb-2">
          Connect Telegram
        </h2>
        <p className="text-[#888]">
          Telegram is the secure channel between you and your AM.
        </p>
      </div>

      {/* Instructions */}
      <div
        className="rounded-xl p-4 flex flex-col gap-3 text-sm"
        style={{
          background: `${accent}08`,
          border: `1px solid ${accent}33`,
        }}
      >
        <p className="text-[#aaa] font-semibold text-xs uppercase tracking-wide">
          How to set up
        </p>
        <div className="flex flex-col gap-2 text-[#ccc]">
          <p>
            <span className="text-white font-medium">1.</span> Open Telegram on your{" "}
            <span className="text-white">phone</span>, find{" "}
            <span className="text-white font-medium">@BotFather</span>
          </p>
          <p>
            <span className="text-white font-medium">2.</span> Send{" "}
            <code className="px-1.5 py-0.5 rounded bg-[#1a1a1a] text-white text-xs">
              /newbot
            </code>{" "}
            — name it, get the <span className="text-white">bot token</span>
          </p>
          <p>
            <span className="text-white font-medium">3.</span> Find{" "}
            <span className="text-white font-medium">@userinfobot</span>{" "}
            — send it anything, get your <span className="text-white">user ID</span>
          </p>
          <p>
            <span className="text-white font-medium">4.</span> Send a message to your new bot so it can reply to you
          </p>
          <p>
            <span className="text-white font-medium">5.</span>{" "}
            <span className="text-white">Email the bot token and user ID to yourself</span>{" "}
            so you can copy them on this computer
          </p>
        </div>
      </div>

      {/* Inputs */}
      <div className="flex flex-col gap-3">
        <div className="flex flex-col gap-1.5">
          <label className="text-sm text-[#aaa] font-medium">Bot username</label>
          <input
            type="text"
            value={usernameInput}
            onChange={(e) => setUsernameInput(e.target.value)}
            placeholder="@amelia_am420_bot"
            className="w-full px-4 py-3 rounded-xl bg-[#1a1a1a] border border-[rgba(255,255,255,0.1)] text-white text-sm placeholder-[#444] focus:outline-none"
            style={{ borderColor: usernameInput ? `${accent}66` : undefined }}
            disabled={status === "ok"}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <label className="text-sm text-[#aaa] font-medium">Bot token</label>
          <input
            type="password"
            value={tokenInput}
            onChange={(e) => setTokenInput(e.target.value)}
            placeholder="123456:ABC-DEF..."
            className="w-full px-4 py-3 rounded-xl bg-[#1a1a1a] border border-[rgba(255,255,255,0.1)] text-white text-sm font-mono placeholder-[#444] focus:outline-none"
            style={{ borderColor: tokenInput ? `${accent}66` : undefined }}
            disabled={status === "ok"}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <label className="text-sm text-[#aaa] font-medium">Your user ID</label>
          <input
            type="text"
            value={chatIdInput}
            onChange={(e) => setChatIdInput(e.target.value)}
            placeholder="123456789"
            className="w-full px-4 py-3 rounded-xl bg-[#1a1a1a] border border-[rgba(255,255,255,0.1)] text-white text-sm font-mono placeholder-[#444] focus:outline-none"
            style={{ borderColor: chatIdInput ? `${accent}66` : undefined }}
            disabled={status === "ok"}
          />
        </div>
      </div>

      {/* Status feedback */}
      {status === "error" && (
        <div className="rounded-xl px-4 py-3 bg-[#FF525222] border border-[#FF525244] text-sm text-[#FF8080]">
          {errorMsg}
        </div>
      )}
      {status === "ok" && (
        <div
          className="rounded-xl px-4 py-3 text-sm"
          style={{
            background: `${accent}22`,
            border: `1px solid ${accent}44`,
            color: accent,
          }}
        >
          ✓ Test message sent — check your Telegram!
        </div>
      )}

      <div className="flex gap-3">
        <button
          onClick={onBack}
          disabled={status === "testing" || status === "ok"}
          className="flex-1 py-3 rounded-xl border border-[rgba(255,255,255,0.1)] text-[#888] font-medium hover:text-white transition-all disabled:opacity-40"
        >
          ← Back
        </button>
        <button
          onClick={handleTest}
          disabled={!tokenInput.trim() || !chatIdInput.trim() || status === "testing" || status === "ok"}
          className="flex-[2] py-3 rounded-xl font-semibold transition-all hover:opacity-90 active:scale-[0.98] disabled:opacity-40"
          style={{ background: accent, color: "#0f0f0f" }}
        >
          {status === "testing"
            ? "Sending test..."
            : status === "ok"
              ? "✓ Connected"
              : "Send test message →"}
        </button>
      </div>
    </div>
  );
}
