"use client";

import { useState } from "react";
import { useWizard } from "../wizard-context";

interface Props {
  onNext: () => void;
  onBack: () => void;
}

type Status = "idle" | "saving" | "ok";

export default function StepGemini({ onNext, onBack }: Props) {
  const { state, update, accent } = useWizard();

  const [input, setInput] = useState(state.geminiKey);
  const [status, setStatus] = useState<Status>("idle");

  const handleSave = async () => {
    if (!input.trim()) {
      // Skip — optional
      onNext();
      return;
    }
    setStatus("saving");
    try {
      const res = await fetch("/api/setup/gemini", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apiKey: input.trim() }),
      });
      const data = await res.json();
      if (data.ok) {
        update({ geminiKey: input.trim() });
        setStatus("ok");
        setTimeout(onNext, 600);
      } else {
        setStatus("idle");
      }
    } catch {
      setStatus("idle");
    }
  };

  const handleSkip = () => {
    update({ geminiKey: "" });
    onNext();
  };

  return (
    <div className="flex flex-col gap-7">
      <div>
        <div className="flex items-center gap-2 mb-2">
          <h2 className="text-3xl font-bold text-white">Gemini API key</h2>
          <span className="px-2 py-0.5 text-xs rounded-full bg-[rgba(255,255,255,0.08)] text-[#666] font-medium">
            Optional
          </span>
        </div>
        <p className="text-[#888]">
          Enables image understanding and vision features. You can add this later in settings.
        </p>
      </div>

      <div className="flex flex-col gap-3">
        <label className="text-sm text-[#aaa] font-medium">API key</label>
        <input
          type="password"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleSave()}
          placeholder="AIza..."
          className="w-full px-4 py-3 rounded-xl bg-[#1a1a1a] border border-[rgba(255,255,255,0.1)] text-white font-mono text-sm placeholder-[#444] focus:outline-none transition-all"
          style={{ borderColor: input ? `${accent}66` : undefined }}
          disabled={status !== "idle"}
        />
        <p className="text-xs text-[#555]">
          Get a free key at aistudio.google.com — stored encrypted on your device
        </p>
      </div>

      {/* What it unlocks */}
      <div className="rounded-xl p-4 bg-[#1a1a1a] border border-[rgba(255,255,255,0.06)] flex flex-col gap-2 text-sm text-[#777]">
        <p className="text-[#aaa] font-medium text-xs uppercase tracking-wide mb-1">
          What Gemini unlocks
        </p>
        <div className="flex items-center gap-2"><span style={{ color: accent }}>✦</span> Image and attachment understanding in emails</div>
        <div className="flex items-center gap-2"><span style={{ color: accent }}>✦</span> Visual content generation</div>
        <div className="flex items-center gap-2"><span style={{ color: accent }}>✦</span> Document and photo analysis</div>
      </div>

      <div className="flex gap-3">
        <button
          onClick={onBack}
          disabled={status !== "idle"}
          className="flex-1 py-3 rounded-xl border border-[rgba(255,255,255,0.1)] text-[#888] font-medium hover:text-white transition-all disabled:opacity-40"
        >
          ← Back
        </button>
        <button
          onClick={handleSkip}
          disabled={status !== "idle"}
          className="flex-1 py-3 rounded-xl border border-[rgba(255,255,255,0.1)] text-[#888] font-medium hover:text-white transition-all disabled:opacity-40"
        >
          Skip
        </button>
        {input && (
          <button
            onClick={handleSave}
            disabled={status !== "idle"}
            className="flex-[2] py-3 rounded-xl font-semibold transition-all hover:opacity-90 active:scale-[0.98] disabled:opacity-60"
            style={{ background: accent, color: "#0f0f0f" }}
          >
            {status === "saving" ? "Saving..." : status === "ok" ? "✓ Saved" : "Save & continue →"}
          </button>
        )}
      </div>
    </div>
  );
}
