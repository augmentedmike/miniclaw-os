import { spawnSync } from "node:child_process";
import type { BookingConfig } from "./config.js";

interface ChargeResult {
  success: boolean;
  paymentId?: string;
  error?: string;
}

interface RefundResult {
  success: boolean;
  refundId?: string;
  amount?: number;
  error?: string;
}

export function chargeViaProvider(
  cfg: BookingConfig,
  amountCents: number,
  currency: string,
  description: string,
): ChargeResult {
  if (cfg.paymentProvider === "none") {
    return { success: true, paymentId: "free" };
  }

  const dollars = (amountCents / 100).toFixed(2);
  const provider = `mc-${cfg.paymentProvider}`;
  const result = spawnSync("openclaw", [provider, "charge", dollars, currency, description], {
    encoding: "utf-8",
    timeout: 30000,
  });

  if (result.status !== 0) {
    return { success: false, error: result.stderr || result.stdout || `${provider} charge failed` };
  }

  const idMatch = result.stdout.match(/ID:\s+(\S+)/);
  return {
    success: true,
    paymentId: idMatch?.[1] || "unknown",
  };
}

export function refundViaProvider(
  cfg: BookingConfig,
  paymentId: string,
  amountCents?: number,
): RefundResult {
  if (cfg.paymentProvider === "none" || paymentId === "free") {
    return { success: true, refundId: "free", amount: 0 };
  }

  const provider = `mc-${cfg.paymentProvider}`;
  const args = [provider, "refund", paymentId];
  if (amountCents) {
    args.push("--amount", (amountCents / 100).toFixed(2));
  }

  const result = spawnSync("openclaw", args, {
    encoding: "utf-8",
    timeout: 30000,
  });

  if (result.status !== 0) {
    return { success: false, error: result.stderr || result.stdout || `${provider} refund failed` };
  }

  const idMatch = result.stdout.match(/ID:\s+(\S+)/);
  const amountMatch = result.stdout.match(/Amount:\s+\$(\d+\.\d+)/);
  return {
    success: true,
    refundId: idMatch?.[1] || "unknown",
    amount: amountMatch ? Math.round(parseFloat(amountMatch[1]) * 100) : amountCents,
  };
}

export function calculateRefundAmount(scheduledTime: string, priceCents: number): number {
  const now = new Date();
  const scheduled = new Date(scheduledTime);
  const hoursUntil = (scheduled.getTime() - now.getTime()) / (1000 * 60 * 60);

  if (hoursUntil >= 48) return priceCents;
  return Math.round(priceCents * 0.5);
}
