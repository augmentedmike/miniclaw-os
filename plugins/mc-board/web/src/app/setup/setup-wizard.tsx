"use client";

import { useState, useCallback, useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";
import Image from "next/image";
import { useWizard } from "./wizard-context";
import InstallOverlay from "./InstallOverlay";
import StepMeetHer from "./steps/StepMeetHer";
import StepTelegram from "./steps/StepTelegram";
import StepGithub from "./steps/StepGithub";
import StepAnthropic from "./steps/StepAnthropic";
import StepEmail from "./steps/StepEmail";
import StepGemini from "./steps/StepGemini";
import StepInstalling from "./steps/StepInstalling";
import StepDone from "./steps/StepDone";

// Re-export for backward compat (step components that import WizardState)
export type { WizardState } from "./wizard-context";

const STEPS = [
  "meet",
  "telegram",
  "github",
  "email",
  "gemini",
  "anthropic",
  "installing",
  "done",
] as const;
type Step = (typeof STEPS)[number];

const NUMBERED_STEPS = ["meet", "telegram", "github", "email", "gemini", "anthropic"] as const;

function stepFromPath(pathname: string): Step {
  const seg = pathname.split("/").pop() || "";
  if (STEPS.includes(seg as Step)) return seg as Step;
  return "meet";
}

export default function SetupWizard() {
  const router = useRouter();
  const pathname = usePathname();
  const { accent } = useWizard();

  const [step, setStepState] = useState<Step>(() => stepFromPath(pathname));

  useEffect(() => {
    setStepState(stepFromPath(pathname));
  }, [pathname]);

  const setStep = useCallback(
    (s: Step) => {
      setStepState(s);
      router.push(`/setup/${s}`);
    },
    [router],
  );

  const next = useCallback(() => {
    const idx = STEPS.indexOf(step);
    if (idx < STEPS.length - 1) setStep(STEPS[idx + 1]);
  }, [step, setStep]);

  const back = useCallback(() => {
    const idx = STEPS.indexOf(step);
    if (idx > 0) setStep(STEPS[idx - 1]);
  }, [step, setStep]);

  const stepNum = NUMBERED_STEPS.indexOf(step as (typeof NUMBERED_STEPS)[number]) + 1;

  // Splash screen — only on very first load
  const [splash, setSplash] = useState(() => {
    if (typeof window === "undefined") return false;
    return !sessionStorage.getItem("mc-splash-shown");
  });
  const [splashFade, setSplashFade] = useState(false);
  const [splashLine, setSplashLine] = useState(0);
  useEffect(() => {
    if (!splash) return;
    sessionStorage.setItem("mc-splash-shown", "1");
    const t1 = setTimeout(() => setSplashLine(1), 800);
    const t2 = setTimeout(() => setSplashLine(2), 1800);
    const t3 = setTimeout(() => setSplashLine(3), 2800);
    const fade = setTimeout(() => setSplashFade(true), 4000);
    const hide = setTimeout(() => setSplash(false), 4700);
    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); clearTimeout(fade); clearTimeout(hide); };
  }, [splash]);

  if (splash) {
    return (
      <div
        className="min-h-screen flex flex-col items-center justify-center"
        style={{ background: "#0f0f0f", opacity: splashFade ? 0 : 1, transition: "opacity 0.7s ease-out" }}
      >
        <Image src="/miniclaw-logo.png" alt="MiniClaw" width={160} height={160} priority style={{ animation: "splashPulse 2s ease-in-out infinite" }} />
        <div style={{ marginTop: 28, textAlign: "center", fontSize: 18, display: "flex", gap: 8, justifyContent: "center" }}>
          {splashLine >= 1 && <span style={{ color: "#ccc", animation: "fadeUp 0.6s ease-out forwards" }}>Your own AI.</span>}
          {splashLine >= 2 && <span style={{ color: "#aaa", animation: "fadeUp 0.6s ease-out forwards" }}>Your Mac.</span>}
          {splashLine >= 3 && <span style={{ color: "#888", animation: "fadeUp 0.6s ease-out forwards" }}>Your data.</span>}
        </div>
        <style>{`
          @keyframes splashPulse { 0%, 100% { transform: scale(1); opacity: 1; } 50% { transform: scale(1.05); opacity: 0.9; } }
          @keyframes fadeUp { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
        `}</style>
      </div>
    );
  }

  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center px-4 py-12"
      style={{ "--user-accent": accent } as React.CSSProperties}
    >
      <InstallOverlay accent={accent} />

      {stepNum > 0 && step !== "installing" && step !== "done" && (
        <div className="mb-8 flex items-center gap-2">
          <span className="text-xs text-[#666] mr-1">{stepNum}/{NUMBERED_STEPS.length}</span>
          {NUMBERED_STEPS.map((_, i) => (
            <div
              key={i}
              className="h-1.5 rounded-full transition-all duration-500"
              style={{ width: i < stepNum ? "32px" : "12px", background: i < stepNum ? accent : "rgba(255,255,255,0.15)" }}
            />
          ))}
        </div>
      )}

      <div className="w-full max-w-xl step-enter" key={step}>
        {step === "meet" && <StepMeetHer onNext={next} />}
        {step === "telegram" && <StepTelegram onNext={next} onBack={back} />}
        {step === "github" && <StepGithub onNext={next} onBack={back} />}
        {step === "email" && <StepEmail onNext={next} onBack={back} />}
        {step === "gemini" && <StepGemini onNext={next} onBack={back} />}
        {step === "anthropic" && <StepAnthropic onNext={next} onBack={back} />}
        {step === "installing" && <StepInstalling onNext={next} />}
        {step === "done" && <StepDone />}
      </div>
    </div>
  );
}
