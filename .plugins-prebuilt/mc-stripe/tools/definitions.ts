import type { AnyAgentTool } from "openclaw/plugin-sdk";
import type { StripeConfig } from "../src/config.js";
import { getStripeClient } from "../src/client.js";

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

export function createStripeTools(cfg: StripeConfig): AnyAgentTool[] {
  return [
    {
      name: "stripe_charge",
      label: "Stripe Charge",
      description:
        "Create a Stripe PaymentIntent. Amount is in cents (e.g. 1999 = $19.99). " +
        "Returns payment intent ID and status.",
      parameters: schema(
        {
          amount_cents: num("Amount in cents (e.g. 1999 for $19.99)"),
          currency: str("Three-letter currency code (e.g. usd)"),
          description: str("Payment description"),
          payment_method_id: optStr("Stripe payment method ID (optional)"),
          customer_id: optStr("Stripe customer ID (optional)"),
        },
        ["amount_cents", "currency", "description"],
      ) as never,
      execute: async (_id: unknown, params: Record<string, unknown>) => {
        try {
          const stripe = getStripeClient(cfg);
          const p: Record<string, unknown> = {
            amount: params.amount_cents,
            currency: (params.currency as string).toLowerCase(),
            description: params.description,
            automatic_payment_methods: { enabled: true },
          };
          if (params.customer_id) p.customer = params.customer_id;
          if (params.payment_method_id) {
            p.payment_method = params.payment_method_id;
            p.confirm = true;
          }
          const pi = await stripe.paymentIntents.create(p as never);
          return ok(
            `PaymentIntent created\n` +
            `ID: ${pi.id}\n` +
            `Amount: $${(pi.amount / 100).toFixed(2)} ${pi.currency.toUpperCase()}\n` +
            `Status: ${pi.status}\n` +
            `Client Secret: ${pi.client_secret || "n/a"}`,
          );
        } catch (e: unknown) {
          return err(`Stripe charge failed: ${(e as Error).message}`);
        }
      },
    },

    {
      name: "stripe_refund",
      label: "Stripe Refund",
      description:
        "Refund a Stripe PaymentIntent. Full refund by default, or specify amount_cents for partial.",
      parameters: schema(
        {
          payment_intent_id: str("Stripe PaymentIntent ID (pi_...)"),
          amount_cents: optStr("Partial refund amount in cents (omit for full refund)"),
          reason: optStr("Reason: duplicate, fraudulent, or requested_by_customer"),
        },
        ["payment_intent_id"],
      ) as never,
      execute: async (_id: unknown, params: Record<string, unknown>) => {
        try {
          const stripe = getStripeClient(cfg);
          const p: Record<string, unknown> = { payment_intent: params.payment_intent_id };
          if (params.amount_cents) p.amount = parseInt(params.amount_cents as string, 10);
          if (params.reason) p.reason = params.reason;
          const refund = await stripe.refunds.create(p as never);
          return ok(
            `Refund created\n` +
            `ID: ${refund.id}\n` +
            `Amount: $${(refund.amount / 100).toFixed(2)}\n` +
            `Status: ${refund.status}`,
          );
        } catch (e: unknown) {
          return err(`Stripe refund failed: ${(e as Error).message}`);
        }
      },
    },

    {
      name: "stripe_status",
      label: "Stripe Status",
      description: "Check the status of a Stripe PaymentIntent.",
      parameters: schema(
        { payment_intent_id: str("Stripe PaymentIntent ID (pi_...)") },
        ["payment_intent_id"],
      ) as never,
      execute: async (_id: unknown, params: Record<string, unknown>) => {
        try {
          const stripe = getStripeClient(cfg);
          const pi = await stripe.paymentIntents.retrieve(params.payment_intent_id as string);
          return ok(
            `PaymentIntent: ${pi.id}\n` +
            `Amount: $${(pi.amount / 100).toFixed(2)} ${pi.currency.toUpperCase()}\n` +
            `Status: ${pi.status}\n` +
            `Description: ${pi.description || "(none)"}\n` +
            `Created: ${new Date(pi.created * 1000).toISOString()}`,
          );
        } catch (e: unknown) {
          return err(`Stripe status failed: ${(e as Error).message}`);
        }
      },
    },

    {
      name: "stripe_customer_create",
      label: "Stripe Create Customer",
      description: "Create a new Stripe customer by email.",
      parameters: schema(
        {
          email: str("Customer email address"),
          name: optStr("Customer name (optional)"),
        },
        ["email"],
      ) as never,
      execute: async (_id: unknown, params: Record<string, unknown>) => {
        try {
          const stripe = getStripeClient(cfg);
          const p: Record<string, unknown> = { email: params.email };
          if (params.name) p.name = params.name;
          const customer = await stripe.customers.create(p as never);
          return ok(
            `Customer created\n` +
            `ID: ${customer.id}\n` +
            `Email: ${customer.email}\n` +
            `Name: ${customer.name || "(none)"}`,
          );
        } catch (e: unknown) {
          return err(`Stripe customer create failed: ${(e as Error).message}`);
        }
      },
    },

    {
      name: "stripe_customer_find",
      label: "Stripe Find Customer",
      description: "Find a Stripe customer by email address.",
      parameters: schema(
        { email: str("Email address to search for") },
        ["email"],
      ) as never,
      execute: async (_id: unknown, params: Record<string, unknown>) => {
        try {
          const stripe = getStripeClient(cfg);
          const list = await stripe.customers.list({ email: params.email as string, limit: 5 });
          if (!list.data.length) return ok("No customers found with that email.");
          const lines = list.data.map(
            (c) => `[${c.id}] ${c.email} — ${c.name || "(no name)"}`,
          );
          return ok(lines.join("\n"));
        } catch (e: unknown) {
          return err(`Stripe customer find failed: ${(e as Error).message}`);
        }
      },
    },
  ];
}
