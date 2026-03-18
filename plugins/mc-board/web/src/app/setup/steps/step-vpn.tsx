"use client";

import { useState, useEffect } from "react";
import { useWizard } from "../wizard-context";

interface Props {
  onNext: () => void;
  onBack: () => void;
}

type Status = "idle" | "checking" | "ok" | "error" | "not-installed";

const COUNTRIES = [
  { code: "us", label: "United States" },
  { code: "gb", label: "United Kingdom" },
  { code: "ca", label: "Canada" },
  { code: "de", label: "Germany" },
  { code: "nl", label: "Netherlands" },
  { code: "se", label: "Sweden" },
  { code: "ch", label: "Switzerland" },
  { code: "jp", label: "Japan" },
  { code: "au", label: "Australia" },
  { code: "sg", label: "Singapore" },
  { code: "fr", label: "France" },
  { code: "fi", label: "Finland" },
  { code: "no", label: "Norway" },
  { code: "dk", label: "Denmark" },
  { code: "at", label: "Austria" },
  { code: "es", label: "Spain" },
  { code: "it", label: "Italy" },
  { code: "br", label: "Brazil" },
];

export default function StepVpn({ onNext, onBack }: Props) {
  const { state, update, accent } = useWizard();
  const assistantName = state.shortName || state.assistantName;

  const [accountInput, setAccountInput] = useState(state.mullvadAccount);
  const [country, setCountry] = useState("us");
  const [status, setStatus] = useState<Status>("idle");
  const [errorMsg, setErrorMsg] = useState("");
  const [vpnInfo, setVpnInfo] = useState<{ installed: boolean; version: string; connected: boolean; country: string } | null>(null);

  // Check if Mullvad is installed on mount
  useEffect(() => {
    fetch("/api/setup/vpn")
      .then((r) => r.json())
      .then((data) => {
        setVpnInfo(data);
        if (!data.installed) setStatus("not-installed");
      })
      .catch(() => {});
  }, []);

  const handleVerify = async () => {
    const account = accountInput.trim();
    if (!account) {
      onNext();
      return;
    }

    setStatus("checking");
    setErrorMsg("");

    try {
      const res = await fetch("/api/setup/vpn", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ account, autoConnect: true, defaultCountry: country }),
      });
      const data = await res.json();
      if (data.ok) {
        update({ mullvadAccount: account });
        setStatus("ok");
        setTimeout(onNext, 1200);
      } else {
        setStatus("error");
        setErrorMsg(data.error || "Failed to save VPN config");
      }
    } catch {
      setStatus("error");
      setErrorMsg("Network error — is the server running?");
    }
  };

  const handleSkip = () => {
    update({ mullvadAccount: "" });
    onNext();
  };

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h2 className="text-3xl font-bold text-white mb-2">VPN</h2>
        <p className="text-[#888]">
          <span className="text-white font-medium">Optional</span> — but highly encouraged for social media and contact mining.
        </p>
      </div>

      {/* Why */}
      <div className="rounded-xl p-4 bg-[rgba(255,255,255,0.03)] border border-[rgba(255,255,255,0.06)] flex flex-col gap-3">
        <p className="text-sm text-[#ccc]">
          A VPN protects {assistantName} when:
        </p>
        <ul className="text-sm text-[#aaa] flex flex-col gap-2 pl-1">
          <li className="flex gap-2">
            <span style={{ color: accent }}>◆</span>
            <span><span className="text-white">Browsing social media</span> — prevents IP-based rate limiting and tracking</span>
          </li>
          <li className="flex gap-2">
            <span style={{ color: accent }}>◆</span>
            <span><span className="text-white">Contact mining</span> — protects your identity when researching leads</span>
          </li>
          <li className="flex gap-2">
            <span style={{ color: accent }}>◆</span>
            <span><span className="text-white">Web scraping</span> — avoids IP bans from automated browsing</span>
          </li>
        </ul>
        <p className="text-xs text-[#666] mt-1">
          MiniClaw uses <span className="text-[#aaa]">Mullvad VPN</span> — no account email, no logging, pay anonymously.
        </p>
      </div>

      {/* Not installed warning */}
      {status === "not-installed" && (
        <div className="rounded-xl px-4 py-3 bg-[#FF8C0022] border border-[#FF8C0044] text-sm text-[#FFB060]">
          Mullvad is not installed. Install it first, then come back to this step.
          <div className="mt-2">
            <a
              href="https://mullvad.net/download/app/pkg/latest"
              target="_blank"
              rel="noopener noreferrer"
              className="underline font-medium"
              style={{ color: accent }}
            >
              Download Mullvad for macOS →
            </a>
          </div>
        </div>
      )}

      {/* Installed info */}
      {vpnInfo?.installed && (
        <div className="rounded-xl px-4 py-3 bg-[rgba(255,255,255,0.03)] border border-[rgba(255,255,255,0.06)] text-xs text-[#888]">
          Mullvad {vpnInfo.version} detected{vpnInfo.connected ? ` — connected (${vpnInfo.country})` : " — not connected"}
        </div>
      )}

      {/* Step 1: Create account */}
      <div className="flex flex-col gap-2">
        <p className="text-sm text-[#ccc]">
          <span className="text-white font-medium">1.</span> Create a Mullvad account (no email required):
        </p>
        <a
          href="https://mullvad.net/account/create"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 text-sm underline"
          style={{ color: accent }}
        >
          mullvad.net/account/create →
        </a>
      </div>

      {/* Step 2: Fund it */}
      <div className="flex flex-col gap-2">
        <p className="text-sm text-[#ccc]">
          <span className="text-white font-medium">2.</span> Add time to your account (from $5/month):
        </p>
        <a
          href="https://mullvad.net/account/payment"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 text-sm underline"
          style={{ color: accent }}
        >
          Fund your account →
        </a>
      </div>

      {/* Step 3: Paste account number */}
      <div className="flex flex-col gap-2">
        <p className="text-sm text-[#ccc]">
          <span className="text-white font-medium">3.</span> Paste your account number:
        </p>
        <input
          type="text"
          value={accountInput}
          onChange={(e) => setAccountInput(e.target.value)}
          placeholder="1234 5678 9012 3456"
          className="w-full px-4 py-3 rounded-xl bg-[#1a1a1a] border border-[rgba(255,255,255,0.1)] text-white text-sm font-mono placeholder-[#444] focus:outline-none tracking-wider"
          style={{ borderColor: accountInput ? `${accent}66` : undefined }}
          disabled={status === "ok"}
        />
        <p className="text-xs text-[#555]">
          16-digit number from your Mullvad account page. Stored encrypted in your vault.
        </p>
      </div>

      {/* Step 4: Default country */}
      <div className="flex flex-col gap-2">
        <p className="text-sm text-[#ccc]">
          <span className="text-white font-medium">4.</span> Default relay country:
        </p>
        <select
          value={country}
          onChange={(e) => setCountry(e.target.value)}
          disabled={status === "ok"}
          className="w-full px-4 py-3 rounded-xl bg-[#1a1a1a] border border-[rgba(255,255,255,0.1)] text-white text-sm focus:outline-none appearance-none"
          style={{ borderColor: `${accent}33` }}
        >
          {COUNTRIES.map((c) => (
            <option key={c.code} value={c.code}>{c.label}</option>
          ))}
        </select>
        <p className="text-xs text-[#555]">
          {assistantName} can switch countries on the fly — this is just the default.
        </p>
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
          ✓ VPN configured — auto-connect enabled
        </div>
      )}

      <div className="flex gap-3">
        <button
          onClick={onBack}
          disabled={status === "checking" || status === "ok"}
          className="flex-1 py-3 rounded-xl border border-[rgba(255,255,255,0.1)] text-[#888] font-medium hover:text-white transition-all disabled:opacity-40"
        >
          ← Back
        </button>
        {accountInput.trim() ? (
          <button
            onClick={handleVerify}
            disabled={status === "checking" || status === "ok" || status === "not-installed"}
            className="flex-[2] py-3 rounded-xl font-semibold transition-all hover:opacity-90 active:scale-[0.98] disabled:opacity-40"
            style={{ background: accent, color: "#0f0f0f" }}
          >
            {status === "checking"
              ? "Saving..."
              : status === "ok"
                ? "✓ Configured"
                : "Save & continue →"}
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
