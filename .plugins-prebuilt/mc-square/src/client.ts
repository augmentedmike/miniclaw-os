import { randomUUID } from "node:crypto";
import type { SquareConfig } from "./config.js";
import { getSquareAccessToken } from "./vault.js";

const BASE_URLS = {
  sandbox: "https://connect.squareupsandbox.com/v2",
  production: "https://connect.squareup.com/v2",
} as const;

export class SquareClient {
  private baseUrl: string;
  private token: string;
  private locationId: string;
  private currency: string;

  constructor(cfg: SquareConfig) {
    const token = getSquareAccessToken(cfg.vaultBin);
    if (!token) throw new Error("No square-access-token in vault. Run: mc mc-square setup");
    this.token = token;
    this.baseUrl = BASE_URLS[cfg.environment];
    this.locationId = cfg.locationId;
    this.currency = cfg.currency;
  }

  private async request(method: string, path: string, body?: unknown): Promise<unknown> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      method,
      headers: {
        "Square-Version": "2025-01-23",
        "Authorization": `Bearer ${this.token}`,
        "Content-Type": "application/json",
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = await res.json();
    if (!res.ok) {
      const errors = (data as { errors?: { detail: string }[] }).errors;
      const msg = errors?.map((e) => e.detail).join("; ") || res.statusText;
      throw new Error(`Square API error (${res.status}): ${msg}`);
    }
    return data;
  }

  async listLocations(): Promise<{ id: string; name: string; status: string }[]> {
    const data = (await this.request("GET", "/locations")) as {
      locations?: { id: string; name: string; status: string }[];
    };
    return data.locations || [];
  }

  async createPayment(amountCents: number, currency?: string, note?: string, customerId?: string): Promise<{
    id: string;
    status: string;
    amount: number;
    currency: string;
    receiptUrl?: string;
  }> {
    const body: Record<string, unknown> = {
      idempotency_key: randomUUID(),
      amount_money: {
        amount: amountCents,
        currency: (currency || this.currency).toUpperCase(),
      },
      location_id: this.locationId,
      autocomplete: false,
    };
    if (note) body.note = note;
    if (customerId) body.customer_id = customerId;

    const data = (await this.request("POST", "/payments", body)) as {
      payment: { id: string; status: string; amount_money: { amount: number; currency: string }; receipt_url?: string };
    };
    const p = data.payment;
    return {
      id: p.id,
      status: p.status,
      amount: p.amount_money.amount,
      currency: p.amount_money.currency,
      receiptUrl: p.receipt_url,
    };
  }

  async getPayment(paymentId: string): Promise<{
    id: string;
    status: string;
    amount: number;
    currency: string;
    note?: string;
    createdAt: string;
    receiptUrl?: string;
  }> {
    const data = (await this.request("GET", `/payments/${paymentId}`)) as {
      payment: { id: string; status: string; amount_money: { amount: number; currency: string }; note?: string; created_at: string; receipt_url?: string };
    };
    const p = data.payment;
    return {
      id: p.id,
      status: p.status,
      amount: p.amount_money.amount,
      currency: p.amount_money.currency,
      note: p.note,
      createdAt: p.created_at,
      receiptUrl: p.receipt_url,
    };
  }

  async listPayments(limit = 10): Promise<{ id: string; status: string; amount: number; currency: string; createdAt: string }[]> {
    const data = (await this.request("GET", `/payments?limit=${limit}&location_id=${this.locationId}`)) as {
      payments?: { id: string; status: string; amount_money: { amount: number; currency: string }; created_at: string }[];
    };
    return (data.payments || []).map((p) => ({
      id: p.id,
      status: p.status,
      amount: p.amount_money.amount,
      currency: p.amount_money.currency,
      createdAt: p.created_at,
    }));
  }

  async refundPayment(paymentId: string, amountCents?: number, reason?: string): Promise<{
    id: string;
    status: string;
    amount: number;
  }> {
    const payment = await this.getPayment(paymentId);
    const body: Record<string, unknown> = {
      idempotency_key: randomUUID(),
      payment_id: paymentId,
      amount_money: {
        amount: amountCents || payment.amount,
        currency: payment.currency,
      },
    };
    if (reason) body.reason = reason;

    const data = (await this.request("POST", "/refunds", body)) as {
      refund: { id: string; status: string; amount_money: { amount: number } };
    };
    return {
      id: data.refund.id,
      status: data.refund.status,
      amount: data.refund.amount_money.amount,
    };
  }

  async createPaymentLink(amountCents: number, title: string, description?: string): Promise<{
    id: string;
    url: string;
    orderId: string;
  }> {
    const body = {
      idempotency_key: randomUUID(),
      quick_pay: {
        name: title,
        price_money: {
          amount: amountCents,
          currency: this.currency,
        },
        location_id: this.locationId,
      },
      checkout_options: {
        allow_tipping: false,
      },
    };
    if (description) {
      (body as Record<string, unknown>).description = description;
    }

    const data = (await this.request("POST", "/online-checkout/payment-links", body)) as {
      payment_link: { id: string; url: string; order_id: string };
    };
    return {
      id: data.payment_link.id,
      url: data.payment_link.url,
      orderId: data.payment_link.order_id,
    };
  }
}
