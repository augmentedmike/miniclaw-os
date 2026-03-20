"use client";

interface Props {
  value: string;
  name: string;
  onChange: (v: string) => void;
  onNext: () => void;
  onBack: () => void;
}

const COLORS = [
  { label: "Teal",   hex: "#00E5CC" },
  { label: "Pink",   hex: "#FF4081" },
  { label: "Purple", hex: "#7C4DFF" },
  { label: "Red",    hex: "#FF5252" },
  { label: "Orange", hex: "#FF6D00" },
  { label: "Blue",   hex: "#2979FF" },
  { label: "White",  hex: "#F5F5F5" },
];

export default function StepColor({ value, name, onChange, onNext, onBack }: Props) {
  return (
    <div className="flex flex-col gap-8">
      <div>
        <h2 className="text-3xl font-bold text-white mb-2">Choose her look</h2>
        <p className="text-[#888]">
          Pick an accent color. You can change it later.
        </p>
      </div>

      {/* Color grid */}
      <div className="grid grid-cols-4 gap-3">
        {COLORS.map((c) => (
          <button
            key={c.hex}
            onClick={() => onChange(c.hex)}
            className="flex flex-col items-center gap-2 p-3 rounded-xl transition-all"
            style={{
              background: value === c.hex ? `${c.hex}22` : "rgba(255,255,255,0.04)",
              border: value === c.hex ? `2px solid ${c.hex}` : "2px solid transparent",
            }}
          >
            <div
              className="w-10 h-10 rounded-full"
              style={{ background: c.hex }}
            />
            <span className="text-xs text-[#888]">{c.label}</span>
          </button>
        ))}
      </div>

      {/* Live preview */}
      <div
        className="rounded-xl p-5 flex items-center gap-4"
        style={{ background: `${value}11`, border: `1px solid ${value}44` }}
      >
        <div
          className="w-14 h-14 rounded-full flex items-center justify-center font-bold text-lg"
          style={{ background: `${value}33`, color: value }}
        >
          {name.slice(0, 2).toUpperCase()}
        </div>
        <div>
          <div className="text-base font-semibold text-white">{name}</div>
          <div className="text-sm" style={{ color: value }}>Online · Ready</div>
        </div>
      </div>

      <div className="flex gap-3">
        <button
          onClick={onBack}
          className="flex-1 py-3 rounded-xl border border-[rgba(255,255,255,0.1)] text-[#888] font-medium hover:text-white transition-all"
        >
          ← Back
        </button>
        <button
          onClick={onNext}
          className="flex-[2] py-3 rounded-xl font-semibold transition-all hover:opacity-90 active:scale-[0.98]"
          style={{ background: value, color: "#0f0f0f" }}
        >
          Continue →
        </button>
      </div>
    </div>
  );
}
