"use client";

import { useState, useRef, useEffect } from "react";
import Image from "next/image";

interface Props {
  name: string;
  shortName: string;
  pronouns: string;
  accentColor: string;
  onChange: (p: {
    assistantName?: string;
    shortName?: string;
    pronouns?: string;
    accentColor?: string;
  }) => void;
  onNext: () => void;
}

const PRONOUN_OPTIONS = ["she/her", "he/him", "they/them"];

const COLORS = [
  { label: "Teal",   hex: "#00E5CC" },
  { label: "Pink",   hex: "#FF4081" },
  { label: "Purple", hex: "#7C4DFF" },
  { label: "Red",    hex: "#FF5252" },
  { label: "Orange", hex: "#FF6D00" },
  { label: "Blue",   hex: "#2979FF" },
  { label: "White",  hex: "#F5F5F5" },
];

export default function StepMeetHer({
  name,
  shortName,
  pronouns,
  accentColor,
  onChange,
  onNext,
}: Props) {
  const [nameInput, setNameInput] = useState(name);
  const [shortInput, setShortInput] = useState(shortName);
  const [selectedPronouns, setSelectedPronouns] = useState(pronouns);
  const [selectedColor, setSelectedColor] = useState(accentColor);
  const [photoSrc, setPhotoSrc] = useState("/amelia.png");
  const [nickError, setNickError] = useState("");
  const [evacPath, setEvacPath] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // Check if there's a backed-up previous install
  useEffect(() => {
    fetch("/api/setup/install")
      .then((r) => r.json())
      .then((data) => {
        if (data.evacuatedInstall) setEvacPath(data.evacuatedInstall);
      })
      .catch(() => {});
  }, []);

  const handlePhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const url = URL.createObjectURL(file);
      setPhotoSrc(url);
    }
  };

  const handleColorChange = (hex: string) => {
    setSelectedColor(hex);
    onChange({ accentColor: hex });
  };

  const handleNext = () => {
    onChange({
      assistantName: nameInput.trim() || "Amelia",
      shortName: shortInput.trim() || "Am",
      pronouns: selectedPronouns,
      accentColor: selectedColor,
    });
    onNext();
  };

  return (
    <div className="flex flex-col gap-5">
      {/* Photo */}
      <div className="flex flex-col items-center gap-3">
        <button
          onClick={() => fileRef.current?.click()}
          className="relative w-32 h-32 rounded-full overflow-hidden border-2 group cursor-pointer"
          style={{ borderColor: selectedColor }}
        >
          <Image
            src={photoSrc}
            alt="Assistant photo"
            width={128}
            height={128}
            className="w-full h-full object-cover"
          />
          <div className="absolute inset-0 bg-black/50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
            <span className="text-white text-xs font-medium">Change</span>
          </div>
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          onChange={handlePhotoUpload}
          className="hidden"
        />
        <h2 className="text-3xl font-bold text-white">Meet your AM</h2>
      </div>

      {/* Previous install notice */}
      {evacPath && (
        <div
          className="rounded-xl px-4 py-3 text-sm"
          style={{
            background: `${selectedColor}11`,
            border: `1px solid ${selectedColor}33`,
          }}
        >
          <p className="font-medium text-white mb-1">Found your previous OpenClaw install</p>
          <p className="text-[#888]">
            Don&apos;t worry — we&apos;ve got you covered. Your original data has been copied to:
          </p>
          <p className="font-mono text-xs mt-1" style={{ color: selectedColor }}>
            {evacPath}
          </p>
        </div>
      )}

      {/* Color */}
      <div className="flex flex-col gap-1.5">
        <label className="text-sm text-[#aaa] font-medium">Color</label>
        <div className="grid grid-cols-7 gap-2">
          {COLORS.map((c) => (
            <button
              key={c.hex}
              onClick={() => handleColorChange(c.hex)}
              className="flex flex-col items-center gap-1.5 p-2 rounded-lg transition-all"
              style={{
                background: selectedColor === c.hex ? `${c.hex}22` : "transparent",
                border: selectedColor === c.hex ? `2px solid ${c.hex}` : "2px solid transparent",
              }}
            >
              <div
                className="w-8 h-8 rounded-full"
                style={{ background: c.hex }}
              />
              <span className="text-[10px] text-[#888]">{c.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Pronouns */}
      <div className="flex flex-col gap-1.5">
        <label className="text-sm text-[#aaa] font-medium">Pronouns</label>
        <div className="flex flex-wrap gap-2">
          {PRONOUN_OPTIONS.map((p) => (
            <button
              key={p}
              onClick={() => setSelectedPronouns(p)}
              className="px-4 py-2 rounded-lg text-sm font-medium transition-all"
              style={{
                background: selectedPronouns === p ? selectedColor : "rgba(255,255,255,0.06)",
                color: selectedPronouns === p ? "#0f0f0f" : "#aaa",
                border: selectedPronouns === p ? "none" : "1px solid rgba(255,255,255,0.1)",
              }}
            >
              {p}
            </button>
          ))}
        </div>
      </div>

      {/* Name */}
      <div className="flex flex-col gap-1.5">
        <label className="text-sm text-[#aaa] font-medium">Name</label>
        <input
          type="text"
          value={nameInput}
          onChange={(e) => setNameInput(e.target.value)}
          placeholder="Amelia"
          maxLength={32}
          className="w-full px-4 py-3 rounded-xl bg-[#1a1a1a] border text-white text-lg font-medium placeholder-[#444] focus:outline-none transition-all"
          style={{ borderColor: nameInput ? selectedColor : "rgba(255,255,255,0.1)" }}
          autoFocus
        />
      </div>

      {/* Nickname */}
      <div className="flex flex-col gap-1.5">
        <label className="text-sm text-[#aaa] font-medium">Nickname</label>
        <input
          type="text"
          value={shortInput}
          onChange={(e) => {
            const raw = e.target.value;
            // Allow only filesystem-safe chars: letters, numbers, dash, underscore
            const sanitized = raw.replace(/[^a-zA-Z0-9_-]/g, "");
            setShortInput(sanitized);
            if (raw !== sanitized) {
              setNickError("Only letters, numbers, dashes, and underscores");
            } else {
              setNickError("");
            }
          }}
          placeholder="Am"
          maxLength={16}
          className="w-full px-4 py-3 rounded-xl bg-[#1a1a1a] border text-white text-lg font-medium placeholder-[#444] focus:outline-none transition-all"
          style={{ borderColor: nickError ? "#FF5252" : shortInput ? selectedColor : "rgba(255,255,255,0.1)" }}
        />
        {nickError && (
          <span className="text-xs text-[#FF5252]">{nickError}</span>
        )}
        <span className="text-xs text-[#555]">
          This becomes ~/{shortInput.toLowerCase() || "am"} on your machine
        </span>
      </div>

      <button
        onClick={handleNext}
        className="w-full py-4 rounded-xl font-semibold text-base transition-all duration-200 hover:opacity-90 active:scale-[0.98]"
        style={{ background: selectedColor, color: "#0f0f0f" }}
      >
        Continue →
      </button>
    </div>
  );
}
