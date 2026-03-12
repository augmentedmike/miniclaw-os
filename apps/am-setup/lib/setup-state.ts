import * as fs from "node:fs";
import * as path from "node:path";

const STATE_DIR = process.env.OPENCLAW_STATE_DIR ?? path.join(process.env.HOME || "", ".openclaw");
const STATE_FILE = path.join(STATE_DIR, "user", "setup-state.json");

export interface SetupState {
  complete: boolean;
  assistantName: string;
  shortName: string;
  accentColor: string;
  pronouns: string;
  visualDescription: string;
  personaBlurb: string;
  emailAddress: string;
  emailConfigured: boolean;
  geminiConfigured: boolean;
  telegramBotUsername: string;
  telegramBotToken: string;
  telegramChatId: string;
  completedAt?: string;
  [key: string]: string | boolean | undefined;
}

const defaults: SetupState = {
  complete: false,
  assistantName: "Amelia",
  shortName: "Am",
  accentColor: "#00E5CC",
  pronouns: "she/her",
  visualDescription: "",
  personaBlurb: "",
  emailAddress: "",
  emailConfigured: false,
  geminiConfigured: false,
  telegramBotUsername: "",
  telegramBotToken: "",
  telegramChatId: "",
};

export function readSetupState(): SetupState {
  try {
    if (fs.existsSync(STATE_FILE)) {
      const raw = fs.readFileSync(STATE_FILE, "utf-8");
      return { ...defaults, ...JSON.parse(raw) };
    }
  } catch {
    // ignore parse errors — return defaults
  }
  return { ...defaults };
}

export function writeSetupState(state: Partial<SetupState>): SetupState {
  const current = readSetupState();
  const next = { ...current, ...state };
  const dir = path.dirname(STATE_FILE);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(STATE_FILE, JSON.stringify(next, null, 2), "utf-8");
  return next;
}

export function isSetupComplete(): boolean {
  return readSetupState().complete;
}
