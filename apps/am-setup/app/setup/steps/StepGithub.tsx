"use client";

import { useState } from "react";

interface Props {
  ghToken: string;
  assistantName: string;
  onChange: (v: string) => void;
  onNext: () => void;
  onBack: () => void;
  accent: string;
}

type Status = "idle" | "testing" | "ok" | "error";

export default function StepGithub({
  ghToken,
  assistantName,
  onChange,
  onNext,
  onBack,
  accent,
}: Props) {
  const [tokenInput, setTokenInput] = useState(ghToken);
  const [status, setStatus] = useState<Status>("idle");
  const [errorMsg, setErrorMsg] = useState("");
  const [ghUser, setGhUser] = useState("");

  const handleTest = async () => {
    const token = tokenInput.trim();
    if (!token) {
      // Skip — GitHub is optional
      onNext();
      return;
    }

    setStatus("testing");
    setErrorMsg("");

    try {
      const res = await fetch("/api/setup/github", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
      const data = await res.json();
      if (data.ok) {
        onChange(token);
        setGhUser(data.username || "");
        setStatus("ok");
        setTimeout(onNext, 1200);
      } else {
        setStatus("error");
        setErrorMsg(data.error || "Token validation failed");
      }
    } catch {
      setStatus("error");
      setErrorMsg("Network error — is the server running?");
    }
  };

  const handleSkip = () => {
    onChange("");
    onNext();
  };

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h2 className="text-3xl font-bold text-white mb-2">GitHub</h2>
        <p className="text-[#888]">
          <span className="text-white font-medium">Optional</span> — but powerful.
        </p>
      </div>

      {/* Why */}
      <div className="rounded-xl p-4 bg-[rgba(255,255,255,0.03)] border border-[rgba(255,255,255,0.06)] flex flex-col gap-3">
        <p className="text-sm text-[#ccc]">
          With GitHub access, {assistantName} can:
        </p>
        <ul className="text-sm text-[#aaa] flex flex-col gap-2 pl-1">
          <li className="flex gap-2">
            <span style={{ color: accent }}>◆</span>
            <span><span className="text-white">Build software with you</span> — clone repos, push branches, open PRs</span>
          </li>
          <li className="flex gap-2">
            <span style={{ color: accent }}>◆</span>
            <span><span className="text-white">Research and analyze</span> — explore code, read issues, review PRs</span>
          </li>
          <li className="flex gap-2">
            <span style={{ color: accent }}>◆</span>
            <span><span className="text-white">Upgrade herself</span> — write custom tools and plugins for your specific workflows</span>
          </li>
        </ul>
        <p className="text-xs text-[#666] mt-1">
          She writes tools that only you and her can use — extending her abilities to match exactly what you need.
        </p>
      </div>

      {/* Step 1: Sign up */}
      <div className="flex flex-col gap-2">
        <p className="text-sm text-[#ccc]">
          <span className="text-white font-medium">1.</span> If you don't have a GitHub account,{" "}
          <a
            href="https://github.com/signup"
            target="_blank"
            rel="noopener noreferrer"
            className="underline"
            style={{ color: accent }}
          >
            sign up here
          </a>
          {" "}(it's free).
        </p>
      </div>

      {/* Step 2: Create token */}
      <div className="flex flex-col gap-2">
        <p className="text-sm text-[#ccc]">
          <span className="text-white font-medium">2.</span> Create a personal access token:
        </p>
        <div className="rounded-lg bg-[#1a1a1a] border border-[rgba(255,255,255,0.08)] p-3 flex flex-col gap-2 text-xs text-[#aaa]">
          <p>
            a. Go to{" "}
            <a
              href="https://github.com/settings/tokens/new"
              target="_blank"
              rel="noopener noreferrer"
              className="underline"
              style={{ color: accent }}
            >
              github.com/settings/tokens/new
            </a>
          </p>
          <p>
            b. Note: <span className="text-white font-mono">{assistantName} access</span>
          </p>
          <p>
            c. Expiration: <span className="text-white">No expiration</span>
          </p>
          <p>
            d. Scopes: check <span className="text-white">every top-level checkbox</span> (repo, workflow, admin:org, etc.)
          </p>
          <p>
            e. Click <span className="text-white">Generate token</span> and copy it
          </p>
        </div>
      </div>

      {/* Step 3: Paste */}
      <div className="flex flex-col gap-2">
        <p className="text-sm text-[#ccc]">
          <span className="text-white font-medium">3.</span> Paste your token here:
        </p>
        <input
          type="password"
          value={tokenInput}
          onChange={(e) => setTokenInput(e.target.value)}
          placeholder="ghp_xxxxxxxxxxxxxxxxxxxx"
          className="w-full px-4 py-3 rounded-xl bg-[#1a1a1a] border border-[rgba(255,255,255,0.1)] text-white text-sm font-mono placeholder-[#444] focus:outline-none"
          style={{ borderColor: tokenInput ? `${accent}66` : undefined }}
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
          style={{ background: `${accent}22`, border: `1px solid ${accent}44`, color: accent }}
        >
          ✓ Connected as <span className="font-mono font-bold">{ghUser}</span>
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
        {tokenInput.trim() ? (
          <button
            onClick={handleTest}
            disabled={status === "testing" || status === "ok"}
            className="flex-[2] py-3 rounded-xl font-semibold transition-all hover:opacity-90 active:scale-[0.98] disabled:opacity-40"
            style={{ background: accent, color: "#0f0f0f" }}
          >
            {status === "testing"
              ? "Verifying..."
              : status === "ok"
                ? "✓ Connected"
                : "Verify token →"}
          </button>
        ) : (
          <button
            onClick={handleSkip}
            className="flex-[2] py-3 rounded-xl font-semibold transition-all hover:opacity-90 active:scale-[0.98]"
            style={{ background: "rgba(255,255,255,0.08)", color: "#aaa" }}
          >
            Skip for now →
          </button>
        )}
      </div>
    </div>
  );
}
