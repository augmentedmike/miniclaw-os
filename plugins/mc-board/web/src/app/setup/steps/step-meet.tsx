"use client";

import { useState, useRef, useEffect } from "react";
import Image from "next/image";
import { useWizard } from "../wizard-context";

interface Props {
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

interface Preset {
  name: string;
  nick: string;
  pronouns: string;
  avatar: string;
}

const PRESETS: Preset[] = [
  { name: "Luna",   nick: "Luna",   pronouns: "she/her",   avatar: "/avatars/luna.png" },
  { name: "Mei",    nick: "Mei",    pronouns: "she/her",   avatar: "/avatars/mei.png" },
  { name: "Nova",   nick: "Nova",   pronouns: "she/her",   avatar: "/avatars/nova.png" },
  { name: "Sierra", nick: "Sierra", pronouns: "she/her",   avatar: "/avatars/sierra.png" },
  { name: "Zara",   nick: "Zara",   pronouns: "she/her",   avatar: "/avatars/zara.png" },
  { name: "Ava",    nick: "Ava",    pronouns: "she/her",   avatar: "/avatars/ava.png" },
  { name: "Kai",    nick: "Kai",    pronouns: "he/him",    avatar: "/avatars/kai.png" },
  { name: "Atlas",  nick: "Atlas",  pronouns: "he/him",    avatar: "/avatars/atlas.png" },
  { name: "Marco",  nick: "Marco",  pronouns: "he/him",    avatar: "/avatars/marco.png" },
  { name: "Erik",   nick: "Erik",   pronouns: "he/him",    avatar: "/avatars/erik.png" },
];

function randomPreset(exclude?: number): number {
  let idx: number;
  do {
    idx = Math.floor(Math.random() * PRESETS.length);
  } while (idx === exclude);
  return idx;
}

export default function StepMeetHer({ onNext }: Props) {
  const { state, update, accent } = useWizard();

  const [presetIdx, setPresetIdx] = useState(() => randomPreset());
  const preset = PRESETS[presetIdx];

  const [nameInput, setNameInput] = useState(state.assistantName || preset.name);
  const [shortInput, setShortInput] = useState(state.shortName || preset.nick);
  const [selectedPronouns, setSelectedPronouns] = useState(state.pronouns || preset.pronouns);
  const [selectedColor, setSelectedColor] = useState(accent);
  const [photoSrc, setPhotoSrc] = useState(preset.avatar);
  const [isCustomPhoto, setIsCustomPhoto] = useState(false);
  const [nickError, setNickError] = useState("");
  const [evacPath, setEvacPath] = useState<string | null>(null);
  const [showPicker, setShowPicker] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // Check if bootstrap evacuated a real previous .openclaw install
  useEffect(() => {
    fetch("/api/setup/install")
      .then((r) => r.json())
      .then((data) => {
        if (data.evacuatedInstall) setEvacPath(data.evacuatedInstall);
      })
      .catch(() => {});
  }, []);

  const handleShuffle = () => {
    const next = randomPreset(presetIdx);
    const p = PRESETS[next];
    setPresetIdx(next);
    setNameInput(p.name);
    setShortInput(p.nick);
    setSelectedPronouns(p.pronouns);
    setPhotoSrc(p.avatar);
    setIsCustomPhoto(false);
  };

  const handleSelectPreset = (idx: number) => {
    const p = PRESETS[idx];
    setPresetIdx(idx);
    setNameInput(p.name);
    setShortInput(p.nick);
    setSelectedPronouns(p.pronouns);
    setPhotoSrc(p.avatar);
    setIsCustomPhoto(false);
    setShowPicker(false);
  };

  const handlePhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setPhotoSrc(URL.createObjectURL(file));
      setIsCustomPhoto(true);
      setShowPicker(false);
    }
  };

  const handleColorChange = (hex: string) => {
    setSelectedColor(hex);
    update({ accentColor: hex });
  };

  const handleNext = () => {
    update({
      assistantName: nameInput.trim() || "MiniClaw",
      shortName: shortInput.trim() || "mc",
      pronouns: selectedPronouns,
      accentColor: selectedColor,
    });
    onNext();
  };

  return (
    <div className="flex flex-col gap-5">

      {/* Avatar + shuffle */}
      <div className="flex flex-col items-center gap-3">
        <div className="relative">
          <button
            onClick={() => setShowPicker(!showPicker)}
            className="relative w-32 h-32 rounded-full overflow-hidden border-2 group cursor-pointer"
            style={{ borderColor: selectedColor }}
          >
            <Image
              src={photoSrc}
              alt="Assistant avatar"
              width={128}
              height={128}
              className="w-full h-full object-cover"
            />
            <div className="absolute inset-0 bg-black/50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
              <span className="text-white text-xs font-medium">Change</span>
            </div>
          </button>
          {/* Dice button */}
          <button
            onClick={handleShuffle}
            className="absolute -right-2 -bottom-1 w-9 h-9 rounded-full flex items-center justify-center text-lg transition-all hover:scale-110 active:scale-90"
            style={{ background: "#1a1a1a", border: `2px solid ${selectedColor}` }}
            title="Randomize"
          >
            🎲
          </button>
        </div>
        <h2 className="text-3xl font-bold text-white">Create your assistant</h2>
      </div>

      {/* Avatar picker */}
      {showPicker && (
        <div className="rounded-xl p-4 bg-[#1a1a1a] border border-[rgba(255,255,255,0.08)]">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm text-[#aaa] font-medium">Choose a character</span>
            <button
              onClick={() => fileRef.current?.click()}
              className="text-xs px-3 py-1 rounded-lg transition-all"
              style={{ background: `${selectedColor}22`, color: selectedColor, border: `1px solid ${selectedColor}33` }}
            >
              Upload your own
            </button>
          </div>
          <div className="grid grid-cols-5 gap-3">
            {PRESETS.map((p, i) => (
              <button
                key={p.name}
                onClick={() => handleSelectPreset(i)}
                className="flex flex-col items-center gap-1.5 p-2 rounded-lg transition-all"
                style={{
                  background: presetIdx === i && !isCustomPhoto ? `${selectedColor}22` : "transparent",
                  border: presetIdx === i && !isCustomPhoto ? `2px solid ${selectedColor}` : "2px solid transparent",
                }}
              >
                <Image
                  src={p.avatar}
                  alt={p.name}
                  width={48}
                  height={48}
                  className="w-12 h-12 rounded-full object-cover"
                />
                <span className="text-[10px] text-[#888]">{p.name}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        onChange={handlePhotoUpload}
        className="hidden"
      />

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
            Don&apos;t worry — your original data has been copied to:
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
          placeholder="e.g. Nova, Atlas, Luna..."
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
            const sanitized = raw.replace(/[^a-zA-Z0-9_-]/g, "");
            setShortInput(sanitized);
            if (raw !== sanitized) {
              setNickError("Only letters, numbers, dashes, and underscores");
            } else {
              setNickError("");
            }
          }}
          placeholder="e.g. Nova, mc..."
          maxLength={16}
          className="w-full px-4 py-3 rounded-xl bg-[#1a1a1a] border text-white text-lg font-medium placeholder-[#444] focus:outline-none transition-all"
          style={{ borderColor: nickError ? "#FF5252" : shortInput ? selectedColor : "rgba(255,255,255,0.1)" }}
        />
        {nickError && (
          <span className="text-xs text-[#FF5252]">{nickError}</span>
        )}
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
