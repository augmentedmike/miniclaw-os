import * as path from "node:path";
import * as os from "node:os";

const STATE_DIR = process.env.OPENCLAW_STATE_DIR ?? path.join(os.homedir(), ".openclaw");

export interface BookingConfig {
  vaultBin: string;
  paymentProvider: "stripe" | "square" | "none";
  port: number;
  origins: string[];
  availableDays: number[];
  timeSlots: number[];
  durationMinutes: number;
  priceCents: number;
  maxPerDay: number;
  windowWeeks: number;
}

export function resolveConfig(raw: Record<string, unknown>): BookingConfig {
  return {
    vaultBin: (raw.vaultBin as string) || path.join(STATE_DIR, "miniclaw", "SYSTEM", "bin", "mc-vault"),
    paymentProvider: (raw.paymentProvider as BookingConfig["paymentProvider"]) || "stripe",
    port: (raw.port as number) || 4221,
    origins: (raw.origins as string[]) || [
      "https://miniclaw.bot",
      "https://augmentedmike.com",
      "http://localhost:3000",
    ],
    availableDays: (raw.availableDays as number[]) || [1, 2, 3],
    timeSlots: (raw.timeSlots as number[]) || [17, 18, 19],
    durationMinutes: (raw.durationMinutes as number) || 90,
    priceCents: (raw.priceCents as number) || 19900,
    maxPerDay: (raw.maxPerDay as number) || 1,
    windowWeeks: (raw.windowWeeks as number) || 4,
  };
}
