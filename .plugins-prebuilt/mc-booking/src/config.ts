import * as path from "node:path";
import * as os from "node:os";

const STATE_DIR = process.env.OPENCLAW_STATE_DIR ?? path.join(os.homedir(), ".openclaw");

export interface BookingConfig {
  vaultBin: string;
  paymentProvider: "stripe" | "square" | "none";
  dbPath: string;
  availableDays: number[];
  timeSlots: number[];
  durationMinutes: number;
  priceCents: number;
  maxPerDay: number;
  windowWeeks: number;
  timezone: string;
  blockedDates: string[];
  rules: string[];
}

export function resolveConfig(raw: Record<string, unknown>): BookingConfig {
  return {
    vaultBin: (raw.vaultBin as string) || path.join(STATE_DIR, "miniclaw", "SYSTEM", "bin", "mc-vault"),
    paymentProvider: (raw.paymentProvider as BookingConfig["paymentProvider"]) || "none",
    dbPath: (raw.dbPath as string) || path.join(STATE_DIR, "USER", "booking", "appointments.db"),
    availableDays: (raw.availableDays as number[]) || [1, 2, 3, 4, 5],
    timeSlots: (raw.timeSlots as number[]) || [9, 10, 11, 14, 15, 16],
    durationMinutes: (raw.durationMinutes as number) || 30,
    priceCents: (raw.priceCents as number) || 0,
    maxPerDay: (raw.maxPerDay as number) || 4,
    windowWeeks: (raw.windowWeeks as number) || 4,
    timezone: (raw.timezone as string) || "America/Chicago",
    blockedDates: (raw.blockedDates as string[]) || [],
    rules: (raw.rules as string[]) || [
      "No meetings before 9am or after 5pm",
      "30-minute default, 1 hour max",
      "15-minute buffer between meetings",
    ],
  };
}
