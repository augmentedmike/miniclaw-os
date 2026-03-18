import Stripe from "stripe";
import type { StripeConfig } from "./config.js";
import { getStripeSecretKey } from "./vault.js";

let _stripe: Stripe | null = null;

export function getStripeClient(cfg: StripeConfig): Stripe {
  if (_stripe) return _stripe;
  const key = getStripeSecretKey(cfg.vaultBin);
  if (!key) throw new Error("No stripe-secret-key in vault. Run: mc mc-stripe setup");
  _stripe = new Stripe(key, { apiVersion: "2025-04-30.basil" });
  return _stripe;
}
