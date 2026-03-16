import * as path from "node:path";
import * as os from "node:os";

const STATE_DIR = process.env.OPENCLAW_STATE_DIR ?? path.join(os.homedir(), ".openclaw");

export interface CalendarConfig {
  defaultCalendar: string;
  helperBin: string;
  pluginDir: string;
}

export function resolveConfig(raw: Record<string, unknown>, pluginDir: string): CalendarConfig {
  return {
    defaultCalendar: (raw.defaultCalendar as string) || "",
    helperBin: path.join(pluginDir, "calendar-helper.app", "Contents", "MacOS", "calendar-helper"),
    pluginDir,
  };
}
