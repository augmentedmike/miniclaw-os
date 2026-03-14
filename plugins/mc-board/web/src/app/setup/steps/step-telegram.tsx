"use client";

import { useState } from "react";
import { useWizard } from "../wizard-context";

interface Props {
  onNext: () => void;
  onBack: () => void;
}

type Status = "idle" | "testing" | "ok" | "error";

export default function StepTelegram({ onNext, onBack }: Props) {
  const { state, update, accent } = useWizard();
  const assistantName = state.shortName || state.assistantName;

  const [usernameInput, setUsernameInput] = useState(state.telegramBotUsername);
  const [tokenInput, setTokenInput] = useState(state.telegramBotToken);
  const [chatIdInput, setChatIdInput] = useState(state.telegramChatId);
  const [status, setStatus] = useState<Status>("idle");
  const [errorMsg, setErrorMsg] = useState("");

  const handleTest = async () => {
    if (!tokenInput.trim() || !chatIdInput.trim()) {
      setErrorMsg("Bot token and user ID are both required");
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
        update({
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

  const displayBotName = usernameInput.trim()
    ? usernameInput.trim().replace(/^@/, "@")
    : "@your_bot";

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h2 className="text-3xl font-bold text-white mb-2">
          Connect Telegram
        </h2>
        <p className="text-[#888]">
          Telegram is the secure channel between you and {assistantName || "your AM"}.
        </p>
      </div>

      {/* Step 1: BotFather + bot username */}
      <div className="flex flex-col gap-2">
        <p className="text-sm text-[#ccc]">
          <span className="text-white font-medium">1.</span> Open Telegram on your phone. Find{" "}
          <span className="text-white font-medium">@BotFather</span>, send{" "}
          <code className="px-1.5 py-0.5 rounded bg-[#1a1a1a] text-white text-xs">/newbot</code>.
          Name it, then create a username for it.
        </p>
        <input
          type="text"
          value={usernameInput}
          onChange={(e) => setUsernameInput(e.target.value)}
          placeholder="@my_assistant_bot"
          className="w-full px-4 py-3 rounded-xl bg-[#1a1a1a] border border-[rgba(255,255,255,0.1)] text-white text-sm placeholder-[#444] focus:outline-none"
          style={{ borderColor: usernameInput ? `${accent}66` : undefined }}
          disabled={status === "ok"}
        />
      </div>

      {/* Step 2: Bot token */}
      <div className="flex flex-col gap-2">
        <p className="text-sm text-[#ccc]">
          <span className="text-white font-medium">2.</span> BotFather gives you a{" "}
          <span className="text-white">bot token</span>. Email it to yourself so you can paste it here.
        </p>
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

      {/* Step 3: Send message to bot (no textfield) */}
      <div>
        <p className="text-sm text-white font-bold">
          3. Send a Telegram message from your phone to{" "}
          <span className="font-mono">{displayBotName}</span>{" "}
          so it can reply to you.
        </p>
      </div>

      {/* Step 4: User ID */}
      <div className="flex flex-col gap-2">
        <p className="text-sm text-[#ccc]">
          <span className="text-white font-medium">4.</span> Find{" "}
          <span className="text-white font-medium">@userinfobot</span> in Telegram, send it anything.
          It replies with your <span className="text-white">user ID</span>. Email it to yourself and paste here.
        </p>
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
