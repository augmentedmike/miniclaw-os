"use client";

import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from "react";

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
  updateTime: string;
};

const DEFAULTS: WizardState = {
  assistantName: "",
  shortName: "",
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
  updateTime: "03:00",
};

const STORAGE_KEY = "mc-wizard-state";

interface WizardContextValue {
  state: WizardState;
  update: (patch: Partial<WizardState>) => void;
  accent: string;
}

const WizardContext = createContext<WizardContextValue | null>(null);

function loadState(): WizardState {
  if (typeof window === "undefined") return { ...DEFAULTS };
  try {
    const saved = sessionStorage.getItem(STORAGE_KEY);
    if (saved) return { ...DEFAULTS, ...JSON.parse(saved) };
  } catch {}
  return { ...DEFAULTS };
}

export function WizardProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<WizardState>(loadState);

  const update = useCallback((patch: Partial<WizardState>) => {
    setState((s) => ({ ...s, ...patch }));
  }, []);

  // Persist to sessionStorage on every change
  useEffect(() => {
    try { sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch {}
  }, [state]);

  return (
    <WizardContext.Provider value={{ state, update, accent: state.accentColor }}>
      {children}
    </WizardContext.Provider>
  );
}

export function useWizard() {
  const ctx = useContext(WizardContext);
  if (!ctx) throw new Error("useWizard must be used inside WizardProvider");
  return ctx;
}
