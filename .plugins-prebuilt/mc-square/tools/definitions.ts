import type { AnyAgentTool } from "openclaw/plugin-sdk";
import type { SquareConfig } from "../src/config.js";
import { SquareClient } from "../src/client.js";

function schema(props: Record<string, unknown>, required?: string[]): unknown {
  return {
    type: "object",
    properties: props,
    required: required ?? [],
    additionalProperties: false,
  };
}

function str(description: string): unknown {
  return { type: "string", description };
}

function optStr(description: string): unknown {
  return { type: "string", description };
}

function num(description: string): unknown {
  return { type: "number", description };
}

function ok(text: string) {
  return { content: [{ type: "text" as const, text: text.trim() }], details: {} };
}

function err(text: string) {
  return {
    content: [{ type: "text" as const, text: text.trim() }],
    isError: true,
    details: {},
  };
}

export function createSquareTools(cfg: SquareConfig): AnyAgentTool[] {
  return [
    {
      name: "square_charge",
      label: "Square Charge",
      description:
        "Create a Square payment. Amount is in cents (e.g. 1999 = $19.99). " +
        "Returns payment ID and status.",
      parameters: schema(
        {
          amount_cents: num("Amount in cents (e.g. 1999 for $19.99)"),
          currency: optStr("Three-letter currency code (default: USD)"),
          note: optStr("Payment note/description"),
          customer_id: optStr("Square customer ID (optional)"),
        },
        ["amount_cents"],
      ) as never,
      execute: async (_id: unknown, params: Record<string, unknown>) => {
        try {
          const client = new SquareClient(cfg);
          const p = await client.createPayment(
            params.amount_cents as number,
            params.currency as string | undefined,
            params.note as string | undefined,
            params.customer_id as string | undefined,
          );
          return ok(
            `Payment created\n` +
            `ID: ${p.id}\n` +
            `Amount: $${(p.amount / 100).toFixed(2)} ${p.currency}\n` +
            `Status: ${p.status}` +
            (p.receiptUrl ? `\nReceipt: ${p.receiptUrl}` : ""),
          );
        } catch (e: unknown) {
          return err(`Square charge failed: ${(e as Error).message}`);
        }
      },
    },

    {
      name: "square_refund",
      label: "Square Refund",
      description: "Refund a Square payment. Full refund by default, or specify amount_cents for partial.",
      parameters: schema(
        {
          payment_id: str("Square payment ID"),
          amount_cents: optStr("Partial refund in cents (omit for full)"),
          reason: optStr("Refund reason"),
        },
        ["payment_id"],
      ) as never,
      execute: async (_id: unknown, params: Record<string, unknown>) => {
        try {
          const client = new SquareClient(cfg);
          const amountCents = params.amount_cents ? parseInt(params.amount_cents as string, 10) : undefined;
          const r = await client.refundPayment(params.payment_id as string, amountCents, params.reason as string | undefined);
          return ok(
            `Refund created\n` +
            `ID: ${r.id}\n` +
            `Amount: $${(r.amount / 100).toFixed(2)}\n` +
            `Status: ${r.status}`,
          );
        } catch (e: unknown) {
          return err(`Square refund failed: ${(e as Error).message}`);
        }
      },
    },

    {
      name: "square_status",
      label: "Square Status",
      description: "Get details of a Square payment.",
      parameters: schema(
        { payment_id: str("Square payment ID") },
        ["payment_id"],
      ) as never,
      execute: async (_id: unknown, params: Record<string, unknown>) => {
        try {
          const client = new SquareClient(cfg);
          const p = await client.getPayment(params.payment_id as string);
          return ok(
            `Payment: ${p.id}\n` +
            `Amount: $${(p.amount / 100).toFixed(2)} ${p.currency}\n` +
            `Status: ${p.status}\n` +
            `Note: ${p.note || "(none)"}\n` +
            `Created: ${p.createdAt}` +
            (p.receiptUrl ? `\nReceipt: ${p.receiptUrl}` : ""),
          );
        } catch (e: unknown) {
          return err(`Square status failed: ${(e as Error).message}`);
        }
      },
    },

    {
      name: "square_list_payments",
      label: "Square List Payments",
      description: "List recent Square payments.",
      parameters: schema({
        limit: optStr("Max number of payments to return (default: 10)"),
      }) as never,
      execute: async (_id: unknown, params: Record<string, unknown>) => {
        try {
          const client = new SquareClient(cfg);
          const limit = params.limit ? parseInt(params.limit as string, 10) : 10;
          const payments = await client.listPayments(limit);
          if (!payments.length) return ok("No payments found.");
          const lines = payments.map(
            (p) => `[${p.id}] $${(p.amount / 100).toFixed(2)} ${p.currency} — ${p.status} (${p.createdAt})`,
          );
          return ok(lines.join("\n"));
        } catch (e: unknown) {
          return err(`Square list failed: ${(e as Error).message}`);
        }
      },
    },

    {
      name: "square_payment_link",
      label: "Square Payment Link",
      description:
        "Create a Square hosted checkout URL (payment link). " +
        "Returns a URL that can be shared with customers for payment.",
      parameters: schema(
        {
          amount_cents: num("Amount in cents"),
          title: str("Payment link title"),
          description: optStr("Payment link description"),
        },
        ["amount_cents", "title"],
      ) as never,
      execute: async (_id: unknown, params: Record<string, unknown>) => {
        try {
          const client = new SquareClient(cfg);
          const link = await client.createPaymentLink(
            params.amount_cents as number,
            params.title as string,
            params.description as string | undefined,
          );
          return ok(
            `Payment link created\n` +
            `ID: ${link.id}\n` +
            `URL: ${link.url}\n` +
            `Order ID: ${link.orderId}`,
          );
        } catch (e: unknown) {
          return err(`Square payment link failed: ${(e as Error).message}`);
        }
      },
    },
  ];
}
