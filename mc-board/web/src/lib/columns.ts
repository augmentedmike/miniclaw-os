import * as fs from "node:fs";
import * as path from "node:path";
import { userDir } from "./paths";

const COLUMNS_FILE = path.join(userDir(), "brain", "board-columns.json");

export interface ColumnConfig {
  maxConcurrency: number;
}

export type ColumnsConfig = Record<string, ColumnConfig>;

const DEFAULTS: ColumnsConfig = {
  backlog: { maxConcurrency: 3 },
  "in-progress": { maxConcurrency: 3 },
  "in-review": { maxConcurrency: 3 },
  shipped: { maxConcurrency: 0 },
};

export function readColumnsConfig(): ColumnsConfig {
  try {
    if (fs.existsSync(COLUMNS_FILE)) {
      const raw = JSON.parse(fs.readFileSync(COLUMNS_FILE, "utf-8"));
      return { ...DEFAULTS, ...raw };
    }
  } catch {}
  return { ...DEFAULTS };
}

export function getColumnMaxConcurrency(column: string): number {
  const config = readColumnsConfig();
  return config[column]?.maxConcurrency ?? 3;
}

export function updateColumnConfig(column: string, patch: Partial<ColumnConfig>): ColumnsConfig {
  const config = readColumnsConfig();
  config[column] = { ...(config[column] ?? { maxConcurrency: 3 }), ...patch };
  fs.mkdirSync(path.dirname(COLUMNS_FILE), { recursive: true });
  fs.writeFileSync(COLUMNS_FILE, JSON.stringify(config, null, 2) + "\n", "utf-8");
  return config;
}
