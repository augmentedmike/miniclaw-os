"use client";

import { useState, useEffect } from "react";

interface Props {
  email: string;
  appPassword: string;
  onChange: (p: { emailAddress?: string; appPassword?: string }) => void;
  onNext: () => void;
  onBack: () => void;
  accent: string;
}

type Status = "idle" | "checking" | "ok" | "error";

function isGmail(email: string): boolean {
  const domain = email.split("@")[1]?.toLowerCase() || "";
  return domain === "gmail.com" || domain === "googlemail.com";
}

export default function StepEmail({ email, appPassword, onChange, onNext, onBack, accent }: Props) {
  const [emailInput, setEmailInput] = useState(email);
  const [passwordInput, setPasswordInput] = useState(appPassword);
  const [smtpHost, setSmtpHost] = useState("");
  const [smtpPort, setSmtpPort] = useState("587");
  const [status, setStatus] = useState<Status>("idle");
  const [errorMsg, setErrorMsg] = useState("");
  const [showInstructions, setShowInstructions] = useState(false);

  const gmail = isGmail(emailInput);
  const hasEmail = emailInput.includes("@");

  // Auto-detect common SMTP hosts
  useEffect(() => {
    if (!gmail && hasEmail) {
      const domain = emailInput.split("@")[1]?.toLowerCase() || "";
      if (domain === "outlook.com" || domain === "hotmail.com") {
        setSmtpHost("smtp.office365.com");
      } else if (domain === "yahoo.com") {
        setSmtpHost("smtp.mail.yahoo.com");
      } else if (domain === "icloud.com" || domain === "me.com") {
        setSmtpHost("smtp.mail.me.com");
      } else {
        setSmtpHost(`smtp.${domain}`);
      }
    }
  }, [emailInput, gmail, hasEmail]);

  const handleVerify = async () => {
    if (!emailInput.trim() || !passwordInput.trim()) {
      setErrorMsg("Both fields are required");
      return;
    }
    if (!gmail && !smtpHost.trim()) {
      setErrorMsg("SMTP host is required for non-Gmail accounts");
      return;
    }
    setStatus("checking");
    setErrorMsg("");

    try {
      const body: Record<string, string> = {
        email: emailInput.trim(),
        appPassword: passwordInput.trim(),
      };
      if (!gmail) {
        body.smtpHost = smtpHost.trim();
        body.smtpPort = smtpPort.trim();
      }
      const res = await fetch("/api/setup/email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (data.ok) {
        onChange({ emailAddress: emailInput.trim(), appPassword: passwordInput.trim() });
        setStatus("ok");
        setTimeout(onNext, 800);
      } else {
        setStatus("error");
        setErrorMsg(data.error || "Verification failed");
      }
    } catch {
      setStatus("error");
      setErrorMsg("Network error — are you connected?");
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="text-3xl font-bold text-white mb-2">Email</h2>
        <p className="text-[#888]">
          <span className="text-white font-medium">Optional</span> — but this is how your AM works independently.
        </p>
      </div>

      {/* Why */}
      <div className="rounded-xl p-4 bg-[rgba(255,255,255,0.03)] border border-[rgba(255,255,255,0.06)] flex flex-col gap-3">
        <p className="text-sm text-[#ccc]">
          Email is the universal API. With an inbox, your AM can:
        </p>
        <ul className="text-sm text-[#aaa] flex flex-col gap-2 pl-1">
          <li className="flex gap-2">
            <span style={{ color: accent }}>◆</span>
            <span><span className="text-white">Act as your agent</span> — send emails, reply to messages, and follow up on your behalf</span>
          </li>
          <li className="flex gap-2">
            <span style={{ color: accent }}>◆</span>
            <span><span className="text-white">Triage your inbox</span> — classify, prioritize, and surface what matters</span>
          </li>
          <li className="flex gap-2">
            <span style={{ color: accent }}>◆</span>
            <span><span className="text-white">Work autonomously</span> — interact with services, receive confirmations, handle account workflows</span>
          </li>
        </ul>
        <p className="text-xs text-[#666] mt-1">
          We recommend creating a dedicated Gmail address for your AM (e.g. amelia.am@gmail.com) so she has her own identity.
        </p>
      </div>

      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <label className="text-sm text-[#aaa] font-medium">Email address</label>
          <input
            type="email"
            value={emailInput}
            onChange={(e) => setEmailInput(e.target.value)}
            placeholder="you@example.com"
            className="w-full px-4 py-3 rounded-xl bg-[#1a1a1a] border border-[rgba(255,255,255,0.1)] text-white placeholder-[#444] focus:outline-none transition-all"
            style={{ borderColor: emailInput ? `${accent}66` : undefined }}
            disabled={status === "checking" || status === "ok"}
          />
        </div>

        {/* Detected provider badge */}
        {hasEmail && (
          <div className="flex items-center gap-2">
            <span
              className="px-2 py-0.5 text-xs rounded-full font-medium"
              style={{
                background: `${accent}22`,
                color: accent,
              }}
            >
              {gmail ? "Gmail detected — using Google IMAP" : "SMTP"}
            </span>
          </div>
        )}

        <div className="flex flex-col gap-2">
          <div className="flex justify-between items-center">
            <label className="text-sm text-[#aaa] font-medium">
              {gmail ? "App password" : "Password"}
            </label>
            {gmail && (
              <button
                onClick={() => setShowInstructions(!showInstructions)}
                className="text-xs transition-colors"
                style={{ color: accent }}
              >
                {showInstructions ? "Hide instructions" : "How to create one?"}
              </button>
            )}
          </div>
          <input
            type="password"
            value={passwordInput}
            onChange={(e) => setPasswordInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleVerify()}
            placeholder={gmail ? "xxxx xxxx xxxx xxxx" : "Your email password"}
            className="w-full px-4 py-3 rounded-xl bg-[#1a1a1a] border border-[rgba(255,255,255,0.1)] text-white placeholder-[#444] focus:outline-none transition-all font-mono"
            style={{ borderColor: passwordInput ? `${accent}66` : undefined }}
            disabled={status === "checking" || status === "ok"}
          />
        </div>

        {/* SMTP fields for non-Gmail */}
        {!gmail && hasEmail && (
          <div className="flex gap-3">
            <div className="flex flex-col gap-2 flex-[3]">
              <label className="text-sm text-[#aaa] font-medium">SMTP host</label>
              <input
                type="text"
                value={smtpHost}
                onChange={(e) => setSmtpHost(e.target.value)}
                placeholder="smtp.example.com"
                className="w-full px-4 py-3 rounded-xl bg-[#1a1a1a] border border-[rgba(255,255,255,0.1)] text-white text-sm placeholder-[#444] focus:outline-none transition-all"
                style={{ borderColor: smtpHost ? `${accent}66` : undefined }}
                disabled={status === "checking" || status === "ok"}
              />
            </div>
            <div className="flex flex-col gap-2 flex-1">
              <label className="text-sm text-[#aaa] font-medium">Port</label>
              <input
                type="text"
                value={smtpPort}
                onChange={(e) => setSmtpPort(e.target.value)}
                placeholder="587"
                className="w-full px-4 py-3 rounded-xl bg-[#1a1a1a] border border-[rgba(255,255,255,0.1)] text-white text-sm placeholder-[#444] focus:outline-none transition-all"
                disabled={status === "checking" || status === "ok"}
              />
            </div>
          </div>
        )}
      </div>

      {/* Gmail instructions panel */}
      {showInstructions && gmail && (
        <div className="rounded-xl p-4 bg-[#1a1a1a] border border-[rgba(255,255,255,0.08)] text-sm text-[#aaa] flex flex-col gap-2">
          <p className="font-semibold text-white">Creating a Google App Password:</p>
          <ol className="list-decimal list-inside flex flex-col gap-1.5">
            <li>Go to <span className="text-white">myaccount.google.com</span></li>
            <li>Select <span className="text-white">Security → 2-Step Verification</span></li>
            <li>Scroll down to <span className="text-white">App passwords</span></li>
            <li>Create a new app password — name it <span className="text-white">&quot;AM Assistant&quot;</span></li>
            <li>Copy the 16-character code and paste it above</li>
          </ol>
          <p className="text-xs text-[#555] mt-1">
            Note: 2-Step Verification must be enabled on your account first.
          </p>
        </div>
      )}

      {/* Status feedback */}
      {status === "error" && (
        <div className="rounded-xl px-4 py-3 bg-[#FF525222] border border-[#FF525244] text-sm text-[#FF8080]">
          {errorMsg}
        </div>
      )}
      {status === "ok" && (
        <div className="rounded-xl px-4 py-3 text-sm" style={{ background: `${accent}22`, border: `1px solid ${accent}44`, color: accent }}>
          ✓ Email verified — continuing...
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
        {emailInput.trim() && passwordInput.trim() ? (
          <button
            onClick={handleVerify}
            disabled={status === "checking" || status === "ok"}
            className="flex-[2] py-3 rounded-xl font-semibold transition-all hover:opacity-90 active:scale-[0.98] disabled:opacity-60"
            style={{ background: accent, color: "#0f0f0f" }}
          >
            {status === "checking" ? "Verifying..." : status === "ok" ? "✓ Verified" : "Verify & continue →"}
          </button>
        ) : (
          <button
            onClick={onNext}
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
