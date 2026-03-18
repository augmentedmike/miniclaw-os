"use client";

import { useState } from "react";
import { useWizard } from "../wizard-context";

interface Props {
  onNext: () => void;
  onBack: () => void;
}

const HOURS = Array.from({ length: 24 }, (_, i) => {
  const hh = String(i).padStart(2, "0");
  const label = i === 0 ? "12:00 AM" : i < 12 ? `${i}:00 AM` : i === 12 ? "12:00 PM" : `${i - 12}:00 PM`;
  return { value: `${hh}:00`, label };
});

export default function StepUpdateTime({ onNext, onBack }: Props) {
  const { state, update, accent } = useWizard();
  const assistantName = state.shortName || state.assistantName || "your assistant";
  const [selected, setSelected] = useState(state.updateTime || "03:00");

  const handleContinue = () => {
    update({ updateTime: selected });
    onNext();
  };

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h2 className="text-4xl font-bold text-white mb-3">
          Nightly updates
        </h2>
        <p className="text-lg text-[#888]">
          {assistantName} can check for updates automatically each night &mdash;
          pulling the latest improvements, rebuilding, and verifying everything
          still works. If anything breaks, {assistantName} rolls back
          automatically.
        </p>
      </div>

      <div className="rounded-xl p-6 bg-[#1a1a1a] border border-[rgba(255,255,255,0.06)] flex flex-col gap-5">
        <div className="flex items-start gap-4">
          <div
            className="w-10 h-10 rounded-lg flex items-center justify-center text-lg flex-shrink-0"
            style={{ background: `${accent}22`, color: accent }}
          >
            &#128337;
          </div>
          <div className="flex-1">
            <p className="text-white text-lg font-medium mb-2">
              When should updates run?
            </p>
            <p className="text-base text-[#888] mb-4">
              Pick a time when your Mac is on but you&apos;re not using it.
              Updates usually take under a minute.
            </p>
            <select
              value={selected}
              onChange={(e) => setSelected(e.target.value)}
              className="w-full px-4 py-3 rounded-xl bg-[#111] border border-[rgba(255,255,255,0.1)] text-white text-lg focus:outline-none appearance-none cursor-pointer transition-all"
              style={{
                borderColor: `${accent}44`,
                backgroundImage: `url("data:image/svg+xml,%3csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 20 20'%3e%3cpath stroke='%23666' stroke-linecap='round' stroke-linejoin='round' stroke-width='1.5' d='M6 8l4 4 4-4'/%3e%3c/svg%3e")`,
                backgroundPosition: "right 12px center",
                backgroundRepeat: "no-repeat",
                backgroundSize: "20px",
              }}
            >
              {HOURS.map((h) => (
                <option key={h.value} value={h.value}>
                  {h.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="flex items-start gap-4">
          <div
            className="w-10 h-10 rounded-lg flex items-center justify-center text-lg flex-shrink-0"
            style={{ background: `${accent}22`, color: accent }}
          >
            &#9989;
          </div>
          <div>
            <p className="text-white text-lg font-medium">Safe &amp; automatic</p>
            <p className="text-base text-[#888]">
              Before updating, {assistantName} takes a backup. After updating, a
              health check runs. If anything fails, the previous version is
              restored instantly.
            </p>
          </div>
        </div>
      </div>

      <div className="flex gap-3">
        <button
          onClick={onBack}
          className="flex-1 py-3.5 rounded-xl border border-[rgba(255,255,255,0.1)] text-[#888] text-lg font-medium hover:text-white transition-all"
        >
          &larr; Back
        </button>
        <button
          onClick={handleContinue}
          className="flex-[2] py-3.5 rounded-xl text-lg font-semibold transition-all hover:opacity-90 active:scale-[0.98]"
          style={{ background: accent, color: "#0f0f0f" }}
        >
          Continue &rarr;
        </button>
      </div>
    </div>
  );
}
