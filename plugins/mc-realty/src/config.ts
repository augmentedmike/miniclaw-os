import * as path from "node:path";
import * as os from "node:os";

const STATE_DIR = process.env.OPENCLAW_STATE_DIR ?? path.join(os.homedir(), ".openclaw");

export interface RealtyConfig {
  vaultBin: string;
  attomApiKeyVault: string;
  defaultMarket: string;
  compRadiusMiles: number;
  compLookbackMonths: number;
  compMaxResults: number;
  bookingDurationMinutes: number;
  transactionStages: string[];
  syndicatePlatforms: string[];
  autoSyndicate: boolean;
  notificationEmail: string;
  dataDir: string;
}

export function resolveConfig(raw: Record<string, unknown>): RealtyConfig {
  return {
    vaultBin: (raw.vaultBin as string) || path.join(STATE_DIR, "miniclaw", "SYSTEM", "bin", "mc-vault"),
    attomApiKeyVault: (raw.attom_api_key_vault as string) || "attom_api_key",
    defaultMarket: (raw.default_market as string) || "",
    compRadiusMiles: (raw.comp_radius_miles as number) || 1.5,
    compLookbackMonths: (raw.comp_lookback_months as number) || 6,
    compMaxResults: (raw.comp_max_results as number) || 10,
    bookingDurationMinutes: (raw.booking_duration_minutes as number) || 30,
    transactionStages: (raw.transaction_stages as string[]) || [
      "listed",
      "showings",
      "offers",
      "under-contract",
      "inspection",
      "appraisal",
      "closing",
      "sold",
    ],
    syndicatePlatforms: (raw.syndicate_platforms as string[]) || ["instagram", "facebook", "twitter"],
    autoSyndicate: raw.auto_syndicate !== undefined ? (raw.auto_syndicate as boolean) : true,
    notificationEmail: (raw.notification_email as string) || "",
    dataDir: path.join(STATE_DIR, "USER", "realty"),
  };
}
