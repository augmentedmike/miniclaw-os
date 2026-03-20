"use client";

import { useState, useEffect, useRef } from "react";

interface Props {
  setupToken: string;
  onChange: (v: string) => void;
  onNext: () => void;
  onBack: () => void;
  accent: string;
  assistantName: string;
}

type Status = "idle" | "waiting" | "ok" | "error";
type Page = "explain" | "plans" | "connect";

export default function StepAnthropic({
  onChange,
  onNext,
  onBack,
  accent,
  assistantName,
}: Props) {
  const [page, setPage] = useState<Page>("explain");
  const [status, setStatus] = useState<Status>("idle");
  const [errorMsg, setErrorMsg] = useState("");
  const [pasteToken, setPasteToken] = useState("");

  const handlePaste = async () => {
    if (!pasteToken.trim()) return;
    setStatus("waiting");
    setErrorMsg("");
    try {
      const res = await fetch("/api/setup/anthropic", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: pasteToken.trim() }),
      });
      const data = await res.json();
      if (data.ok) {
        onChange("token-pasted");
        setStatus("ok");
        setTimeout(onNext, 600);
      } else {
        setErrorMsg(data.error || "Token failed");
        setStatus("error");
      }
    } catch {
      setErrorMsg("Could not save token");
      setStatus("error");
    }
  };

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Poll for auth status while waiting
  useEffect(() => {
    if (status !== "waiting") return;
    pollRef.current = setInterval(async () => {
      try {
        const res = await fetch("/api/setup/anthropic");
        const data = await res.json();
        if (data.authed) {
          if (pollRef.current) clearInterval(pollRef.current);
          onChange("oauth-complete");
          setStatus("ok");
          setTimeout(onNext, 600);
        }
      } catch {}
    }, 2000);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [status, onChange, onNext]);

  const handleConnect = async () => {
    setStatus("waiting");
    setErrorMsg("");
    // Fire and forget — kicks off claude setup-token
    try {
      await fetch("/api/setup/anthropic", { method: "POST" });
    } catch {}
    // Polling in useEffect above will detect when auth completes
  };

  /* ── Page 1: Explain how compute works ──────────────────────────── */
  if (page === "explain") {
    return (
      <div className="flex flex-col gap-8">
        <div>
          <h2 className="text-4xl font-bold text-white mb-3">
            How {assistantName} thinks
          </h2>
          <p className="text-lg text-[#888]">
            {assistantName} needs a brain to work &mdash; that brain is Claude,
            made by a company called Anthropic. Every time{" "}
            {assistantName.toLowerCase()} does something for you, it costs a
            tiny bit of processing power.
          </p>
        </div>

        <div className="rounded-xl p-6 bg-[#1a1a1a] border border-[rgba(255,255,255,0.06)] flex flex-col gap-5">
          <div className="flex items-start gap-4">
            <div
              className="w-10 h-10 rounded-lg flex items-center justify-center text-lg flex-shrink-0"
              style={{ background: `${accent}22`, color: accent }}
            >
              &harr;
            </div>
            <div>
              <p className="text-white text-lg font-medium">Chatting</p>
              <p className="text-lg text-[#999]">
                Asking questions, getting advice, having a conversation
              </p>
            </div>
          </div>

          <div className="flex items-start gap-4">
            <div
              className="w-10 h-10 rounded-lg flex items-center justify-center text-lg flex-shrink-0"
              style={{ background: `${accent}22`, color: accent }}
            >
              &#9881;
            </div>
            <div>
              <p className="text-white text-lg font-medium">Working in the background</p>
              <p className="text-lg text-[#999]">
                Checking your email, organizing your tasks, running scheduled
                jobs &mdash; even while you sleep
              </p>
            </div>
          </div>

          <div className="flex items-start gap-4">
            <div
              className="w-10 h-10 rounded-lg flex items-center justify-center text-lg flex-shrink-0"
              style={{ background: `${accent}22`, color: accent }}
            >
              &#9889;
            </div>
            <div>
              <p className="text-white text-lg font-medium">
                Harder tasks use more
              </p>
              <p className="text-lg text-[#999]">
                A quick answer is cheap. Writing a long email or researching
                something takes more. {assistantName} manages this for you
                automatically.
              </p>
            </div>
          </div>
        </div>

        <div className="rounded-xl p-5 bg-[#1a1a1a] border border-[rgba(255,255,255,0.06)] flex flex-col gap-3">
          <p className="text-lg text-[#aaa] font-medium">Why a subscription?</p>
          <p className="text-lg text-[#999]">
            A subscription is{" "}
            <span className="text-white">much cheaper</span> than paying per
            use. And it&apos;s a{" "}
            <span className="text-white">flat monthly price</span> &mdash;
            you&apos;ll never get a surprise bill. When your plan&apos;s
            allowance runs out for the month,{" "}
            {assistantName.toLowerCase()} simply pauses until it resets.
            And these plans keep getting better &mdash; you get more
            compute for the same price as the technology improves.
          </p>
        </div>

        <div className="flex gap-3">
          <button
            onClick={onBack}
            className="flex-1 py-3.5 rounded-xl border border-[rgba(255,255,255,0.1)] text-[#888] text-lg font-medium hover:text-white transition-all"
          >
            &larr; Back
          </button>
          <button
            onClick={() => setPage("plans")}
            className="flex-[2] py-3.5 rounded-xl text-lg font-semibold transition-all hover:opacity-90 active:scale-[0.98]"
            style={{ background: accent, color: "#0f0f0f" }}
          >
            Choose a plan &rarr;
          </button>
        </div>
      </div>
    );
  }

  /* ── Page 2: Plan selector ──────────────────────────────────────── */
  if (page === "plans") {
    return (
      <div className="flex flex-col gap-8">
        <div>
          <h2 className="text-4xl font-bold text-white mb-3">
            Pick your plan
          </h2>
          <p className="text-lg text-[#888]">
            Choose based on how much you expect {assistantName.toLowerCase()} to
            do. You can change your plan anytime on claude.ai.
          </p>
        </div>

        {/* Plan cards */}
        <div className="flex flex-col gap-4">
          {/* Light */}
          <div
            className="rounded-xl p-5 border flex items-center gap-4"
            style={{
              borderColor: `${accent}33`,
              background: `${accent}06`,
            }}
          >
            <div
              className="w-14 h-14 rounded-full flex items-center justify-center text-lg font-bold flex-shrink-0"
              style={{ background: `${accent}18`, color: accent }}
            >
              $20
            </div>
            <div className="flex-1">
              <p className="text-white text-lg font-medium">Light</p>
              <p className="text-base text-[#999]">
                Check in a few times a day, ask quick questions
              </p>
            </div>
            <span className="text-base text-[#555]">/mo</span>
          </div>

          {/* Average — recommended */}
          <div
            className="rounded-xl p-5 border-2 flex items-center gap-4 relative"
            style={{
              borderColor: accent,
              background: `${accent}11`,
            }}
          >
            <div
              className="absolute -top-3 right-4 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider"
              style={{ background: accent, color: "#0f0f0f" }}
            >
              recommended
            </div>
            <div
              className="w-14 h-14 rounded-full flex items-center justify-center text-lg font-bold flex-shrink-0"
              style={{ background: `${accent}33`, color: accent }}
            >
              $100
            </div>
            <div className="flex-1">
              <p className="text-white text-lg font-medium">Average</p>
              <p className="text-base text-[#888]">
                Use throughout the day &mdash; email, tasks, and scheduling
              </p>
            </div>
            <span className="text-base text-[#555]">/mo</span>
          </div>

          {/* Power */}
          <div className="rounded-xl p-5 border border-[rgba(255,255,255,0.1)] flex items-center gap-4">
            <div className="w-14 h-14 rounded-full flex items-center justify-center text-lg font-bold bg-[rgba(255,255,255,0.06)] text-[#aaa] flex-shrink-0">
              $200
            </div>
            <div className="flex-1">
              <p className="text-white text-lg font-medium">Power</p>
              <p className="text-base text-[#999]">
                All-day assistant &mdash; runs your business, handles
                everything
              </p>
            </div>
            <span className="text-base text-[#555]">/mo</span>
          </div>
        </div>

        <div className="flex flex-col gap-3">
          <button
            onClick={() => {
              window.open("https://claude.ai/login", "_blank");
              setTimeout(() => setPage("connect"), 500);
            }}
            className="w-full py-4 rounded-xl text-lg font-semibold transition-all hover:opacity-90 active:scale-[0.98]"
            style={{ background: accent, color: "#0f0f0f" }}
          >
            Sign up for Claude &rarr;
          </button>
          <button
            onClick={() => setPage("connect")}
            className="w-full py-3.5 rounded-xl border border-[rgba(255,255,255,0.15)] text-[#aaa] text-lg font-medium hover:text-white transition-all"
          >
            I already have my Claude subscription
          </button>
        </div>

        <button
          onClick={() => setPage("explain")}
          className="text-base text-[#555] hover:text-[#888] transition-colors"
        >
          &larr; Back
        </button>
      </div>
    );
  }

  /* ── Page 3: Connect via OAuth ──────────────────────────────────── */
  return (
    <div className="flex flex-col gap-8">
      <div>
        <h2 className="text-4xl font-bold text-white mb-3">
          Connect your Claude account
        </h2>
        <p className="text-lg text-[#888]">
          Click the button below and sign in to your Claude account in the
          browser window that opens. Once you&apos;re signed in,{" "}
          {assistantName.toLowerCase()} will be connected automatically.
        </p>
      </div>

      <div className="flex flex-col gap-4 items-center">
        {status === "waiting" && (
          <div className="rounded-xl p-6 bg-[#1a1a1a] border border-[rgba(255,255,255,0.06)] w-full text-center">
            <p className="text-lg text-[#aaa] mb-2">
              Waiting for you to sign in...
            </p>
            <p className="text-base text-[#666]">
              A browser window should have opened. Sign in to your Claude
              account there, then come back here.
            </p>
          </div>
        )}

        {status === "ok" && (
          <div className="rounded-xl p-6 bg-[#1a1a1a] border w-full text-center"
            style={{ borderColor: `${accent}44` }}
          >
            <p className="text-lg font-medium" style={{ color: accent }}>
              Connected!
            </p>
          </div>
        )}

        {errorMsg && (
          <p className="text-base text-[#FF5252]">{errorMsg}</p>
        )}

        {/* Fallback: paste a session token if OAuth gives one */}
        {(status === "waiting" || status === "error") && (
          <div className="rounded-xl p-5 bg-[#1a1a1a] border border-[rgba(255,255,255,0.06)] w-full flex flex-col gap-3">
            <p className="text-base text-[#777]">
              If you received a code to paste, enter it here:
            </p>
            <input
              type="password"
              value={pasteToken}
              onChange={(e) => setPasteToken(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && pasteToken.trim() && handlePaste()}
              placeholder="Paste code here..."
              className="w-full px-5 py-4 rounded-xl bg-[#111] border border-[rgba(255,255,255,0.1)] text-white font-mono text-lg placeholder-[#444] focus:outline-none transition-all"
              style={{
                borderColor: pasteToken ? `${accent}66` : undefined,
              }}
            />
            {pasteToken.trim() && (
              <button
                onClick={handlePaste}
                className="w-full py-3 rounded-xl text-lg font-semibold transition-all hover:opacity-90 active:scale-[0.98]"
                style={{ background: accent, color: "#0f0f0f" }}
              >
                Submit code
              </button>
            )}
          </div>
        )}
      </div>

      <div className="flex gap-3">
        <button
          onClick={() => setPage("plans")}
          disabled={status === "waiting"}
          className="flex-1 py-3.5 rounded-xl border border-[rgba(255,255,255,0.1)] text-[#888] text-lg font-medium hover:text-white transition-all disabled:opacity-40"
        >
          &larr; Back
        </button>
        <button
          onClick={handleConnect}
          disabled={status === "waiting" || status === "ok"}
          className="flex-[2] py-3.5 rounded-xl text-lg font-semibold transition-all hover:opacity-90 active:scale-[0.98] disabled:opacity-60"
          style={{ background: accent, color: "#0f0f0f" }}
        >
          {status === "waiting"
            ? "Waiting for sign-in..."
            : status === "ok"
              ? "Connected"
              : "Sign in to Claude"}
        </button>
      </div>
    </div>
  );
}
