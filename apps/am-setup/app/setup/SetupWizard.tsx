"use client";

import { useState, useCallback, useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";
import InstallOverlay from "./InstallOverlay";
import StepMeetHer from "./steps/StepMeetHer";
import StepTelegram from "./steps/StepTelegram";
import StepGithub from "./steps/StepGithub";
import StepAnthropic from "./steps/StepAnthropic";
import StepEmail from "./steps/StepEmail";
import StepGemini from "./steps/StepGemini";
import StepInstalling from "./steps/StepInstalling";
import StepDone from "./steps/StepDone";

export type WizardState = {
  assistantName: string;
  shortName: string;
  pronouns: string;
  accentColor: string;
  personaBlurb: string;
  anthropicToken: string;
  emailAddress: string;
  appPassword: string;
  geminiKey: string;
  ghToken: string;
  telegramBotUsername: string;
  telegramBotToken: string;
  telegramChatId: string;
};

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
  const [step, setStepState] = useState<Step>(() => stepFromPath(pathname));
  const [state, setState] = useState<WizardState>({
    assistantName: "Amelia",
    shortName: "Am",
    pronouns: "she/her",
    accentColor: "#00E5CC",
    personaBlurb: "",
    anthropicToken: "",
    emailAddress: "",
    appPassword: "",
    geminiKey: "",
    ghToken: "",
    telegramBotUsername: "",
    telegramBotToken: "",
    telegramChatId: "",
  });

  // Sync step from URL on pathname change
  useEffect(() => {
    const s = stepFromPath(pathname);
    setStepState(s);
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

  const update = useCallback((patch: Partial<WizardState>) => {
    setState((s) => ({ ...s, ...patch }));
  }, []);

  const stepNum = NUMBERED_STEPS.indexOf(step as (typeof NUMBERED_STEPS)[number]) + 1;

  const accentStyle = {
    "--user-accent": state.accentColor,
  } as React.CSSProperties;

  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center px-4 py-12"
      style={accentStyle}
    >
      {/* Background install — floating indicator + draggable log modal */}
      <InstallOverlay accent={state.accentColor} />

      {/* Progress indicator */}
      {stepNum > 0 && step !== "installing" && step !== "done" && (
        <div className="mb-8 flex items-center gap-2">
          <span className="text-xs text-[#666] mr-1">
            {stepNum}/{NUMBERED_STEPS.length}
          </span>
          {NUMBERED_STEPS.map((_, i) => (
            <div
              key={i}
              className="h-1.5 rounded-full transition-all duration-500"
              style={{
                width: i < stepNum ? "32px" : "12px",
                background:
                  i < stepNum
                    ? state.accentColor
                    : "rgba(255,255,255,0.15)",
              }}
            />
          ))}
        </div>
      )}

      {/* Step content */}
      <div className="w-full max-w-xl step-enter" key={step}>
        {step === "meet" && (
          <StepMeetHer
            name={state.assistantName}
            shortName={state.shortName}
            pronouns={state.pronouns}
            accentColor={state.accentColor}
            onChange={(p) => update(p)}
            onNext={next}
          />
        )}
        {step === "telegram" && (
          <StepTelegram
            botUsername={state.telegramBotUsername}
            botToken={state.telegramBotToken}
            chatId={state.telegramChatId}
            assistantName={state.shortName || state.assistantName}
            onChange={(p) => update(p)}
            onNext={next}
            onBack={back}
            accent={state.accentColor}
          />
        )}
        {step === "github" && (
          <StepGithub
            ghToken={state.ghToken}
            assistantName={state.shortName || state.assistantName}
            onChange={(v) => update({ ghToken: v })}
            onNext={next}
            onBack={back}
            accent={state.accentColor}
          />
        )}
        {step === "email" && (
          <StepEmail
            email={state.emailAddress}
            appPassword={state.appPassword}
            onChange={(p) => update(p)}
            onNext={next}
            onBack={back}
            accent={state.accentColor}
          />
        )}
        {step === "gemini" && (
          <StepGemini
            apiKey={state.geminiKey}
            onChange={(v) => update({ geminiKey: v })}
            onNext={next}
            onBack={back}
            accent={state.accentColor}
          />
        )}
        {step === "anthropic" && (
          <StepAnthropic
            setupToken={state.anthropicToken}
            onChange={(v) => update({ anthropicToken: v })}
            onNext={next}
            onBack={back}
            accent={state.accentColor}
            assistantName={state.shortName || state.assistantName}
          />
        )}
        {step === "installing" && (
          <StepInstalling state={state} onDone={next} accent={state.accentColor} />
        )}
        {step === "done" && (
          <StepDone
            name={state.shortName || state.assistantName}
            accent={state.accentColor}
          />
        )}
      </div>
    </div>
  );
}
