"use client";

import { useState, useCallback } from "react";
import StepMeetHer from "./steps/StepMeetHer";
import StepTelegram from "./steps/StepTelegram";

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
  emailAddress: string;
  appPassword: string;
  geminiKey: string;
  telegramBotUsername: string;
  telegramBotToken: string;
  telegramChatId: string;
};

const STEPS = [
  "meet",
  "telegram",
  "email",
  "gemini",
  "installing",
  "done",
] as const;
type Step = (typeof STEPS)[number];

const NUMBERED_STEPS = ["meet", "telegram", "email", "gemini"] as const;

export default function SetupWizard() {
  const [step, setStep] = useState<Step>("meet");
  const [state, setState] = useState<WizardState>({
    assistantName: "Amelia",
    shortName: "Am",
    pronouns: "she/her",
    accentColor: "#00E5CC",
    personaBlurb: "",
    emailAddress: "",
    appPassword: "",
    geminiKey: "",
    telegramBotUsername: "",
    telegramBotToken: "",
    telegramChatId: "",
  });

  const next = useCallback(() => {
    const idx = STEPS.indexOf(step);
    if (idx < STEPS.length - 1) setStep(STEPS[idx + 1]);
  }, [step]);

  const back = useCallback(() => {
    const idx = STEPS.indexOf(step);
    if (idx > 0) setStep(STEPS[idx - 1]);
  }, [step]);

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
      <div className="w-full max-w-md step-enter" key={step}>
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
