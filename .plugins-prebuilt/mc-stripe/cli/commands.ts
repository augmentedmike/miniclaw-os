import * as readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import type { Command } from "commander";
import type { Logger } from "openclaw/plugin-sdk";
import type { StripeConfig } from "../src/config.js";
import { getStripeClient } from "../src/client.js";
import {
  getStripeSecretKey,
  saveStripeSecretKey,
  saveStripePublishableKey,
} from "../src/vault.js";

interface Ctx {
  program: Command;
  cfg: StripeConfig;
  logger: Logger;
}

export function registerStripeCommands(ctx: Ctx): void {
  const { program, cfg } = ctx;

  const sub = program
    .command("mc-stripe")
    .description("Stripe payment service — charge, refund, customer management");

  // ---- setup ----
  sub
    .command("setup")
    .description("Guided walkthrough: create Stripe account, paste keys, vault them, verify")
    .action(async () => {
      const existingSk = getStripeSecretKey(cfg.vaultBin);
      if (existingSk) {
        console.log(`Stripe secret key already in vault (${existingSk.substring(0, 7)}...).`);
        console.log("Verifying with balance.retrieve()...");
        try {
          const stripe = getStripeClient(cfg);
          const balance = await stripe.balance.retrieve();
          console.log(`Balance OK — ${balance.available.length} currency(ies) available.`);
          console.log("Stripe is configured and working.");
          return;
        } catch (e: unknown) {
          console.error(`Balance check failed: ${(e as Error).message}`);
          console.log("Your key may be invalid. Re-run setup to replace it.");
        }
      }

      const rl = readline.createInterface({ input, output });
      console.log();
      console.log("=== Stripe Setup ===");
      console.log();
      console.log("1. Go to https://dashboard.stripe.com/register (or log in)");
      console.log("2. Go to https://dashboard.stripe.com/apikeys");
      console.log("3. Copy your Secret key (sk_test_... or sk_live_...)");
      console.log("4. Copy your Publishable key (pk_test_... or pk_live_...)");
      console.log();

      if (cfg.testMode) {
        console.log("⚠  testMode is ON — only sk_test_ keys will be accepted.");
        console.log();
      }

      const sk = await rl.question("Paste your Stripe Secret Key: ");
      if (!sk.trim()) {
        console.error("No key entered, aborted.");
        rl.close();
        process.exit(1);
      }

      if (cfg.testMode && !sk.trim().startsWith("sk_test_")) {
        console.error("testMode is ON — only sk_test_ keys are accepted. Aborted.");
        rl.close();
        process.exit(1);
      }

      const pk = await rl.question("Paste your Stripe Publishable Key: ");
      rl.close();

      if (!pk.trim()) {
        console.error("No publishable key entered, aborted.");
        process.exit(1);
      }

      saveStripeSecretKey(cfg.vaultBin, sk.trim());
      saveStripePublishableKey(cfg.vaultBin, pk.trim());
      console.log("Keys saved to vault.");

      console.log("Verifying with balance.retrieve()...");
      try {
        const stripe = getStripeClient(cfg);
        const balance = await stripe.balance.retrieve();
        console.log(`Balance OK — ${balance.available.length} currency(ies) available.`);
        console.log("Stripe setup complete.");
      } catch (e: unknown) {
        console.error(`Balance check failed: ${(e as Error).message}`);
        console.error("Keys were saved but may be invalid. Check your Stripe dashboard.");
        process.exit(1);
      }
    });

  // ---- charge ----
  sub
    .command("charge <amount> <currency> <description>")
    .description("Create a PaymentIntent (amount in dollars, e.g. 19.99)")
    .option("--customer <id>", "Stripe customer ID")
    .option("--payment-method <id>", "Payment method ID")
    .action(async (amount: string, currency: string, description: string, opts: { customer?: string; paymentMethod?: string }) => {
      const dollars = parseFloat(amount);
      if (isNaN(dollars) || dollars <= 0) {
        console.error("Amount must be a positive number (in dollars).");
        process.exit(1);
      }
      const cents = Math.round(dollars * 100);
      const stripe = getStripeClient(cfg);

      const params: Record<string, unknown> = {
        amount: cents,
        currency: currency.toLowerCase(),
        description,
        automatic_payment_methods: { enabled: true },
      };
      if (opts.customer) params.customer = opts.customer;
      if (opts.paymentMethod) {
        params.payment_method = opts.paymentMethod;
        params.confirm = true;
      }

      const pi = await stripe.paymentIntents.create(params as never);
      console.log(`PaymentIntent created:`);
      console.log(`  ID:          ${pi.id}`);
      console.log(`  Amount:      $${(pi.amount / 100).toFixed(2)} ${pi.currency.toUpperCase()}`);
      console.log(`  Status:      ${pi.status}`);
      console.log(`  Description: ${pi.description}`);
      if (pi.client_secret) {
        console.log(`  Client Secret: ${pi.client_secret}`);
      }
    });

  // ---- refund ----
  sub
    .command("refund <payment-intent-id>")
    .description("Full or partial refund of a PaymentIntent")
    .option("--amount <dollars>", "Partial refund amount in dollars")
    .option("--reason <reason>", "Reason: duplicate, fraudulent, requested_by_customer")
    .action(async (piId: string, opts: { amount?: string; reason?: string }) => {
      const stripe = getStripeClient(cfg);
      const params: Record<string, unknown> = { payment_intent: piId };

      if (opts.amount) {
        const dollars = parseFloat(opts.amount);
        if (isNaN(dollars) || dollars <= 0) {
          console.error("Refund amount must be a positive number.");
          process.exit(1);
        }
        params.amount = Math.round(dollars * 100);
      }
      if (opts.reason) params.reason = opts.reason;

      const refund = await stripe.refunds.create(params as never);
      console.log(`Refund created:`);
      console.log(`  ID:     ${refund.id}`);
      console.log(`  Amount: $${(refund.amount / 100).toFixed(2)}`);
      console.log(`  Status: ${refund.status}`);
    });

  // ---- status ----
  sub
    .command("status <payment-intent-id>")
    .description("Check payment status")
    .action(async (piId: string) => {
      const stripe = getStripeClient(cfg);
      const pi = await stripe.paymentIntents.retrieve(piId);
      console.log(`PaymentIntent: ${pi.id}`);
      console.log(`  Amount:      $${(pi.amount / 100).toFixed(2)} ${pi.currency.toUpperCase()}`);
      console.log(`  Status:      ${pi.status}`);
      console.log(`  Description: ${pi.description || "(none)"}`);
      console.log(`  Created:     ${new Date(pi.created * 1000).toISOString()}`);
      if (pi.latest_charge) {
        console.log(`  Charge:      ${pi.latest_charge}`);
      }
    });

  // ---- customers ----
  const customers = sub
    .command("customers")
    .description("Customer management");

  customers
    .command("list")
    .description("List recent customers")
    .option("-n, --limit <n>", "Max customers", "10")
    .action(async (opts: { limit: string }) => {
      const stripe = getStripeClient(cfg);
      const list = await stripe.customers.list({ limit: parseInt(opts.limit, 10) });
      if (!list.data.length) {
        console.log("No customers found.");
        return;
      }
      for (const c of list.data) {
        console.log(`[${c.id}] ${c.email || "(no email)"} — ${c.name || "(no name)"}`);
      }
    });

  customers
    .command("create <email>")
    .description("Create a new customer")
    .option("--name <name>", "Customer name")
    .action(async (email: string, opts: { name?: string }) => {
      const stripe = getStripeClient(cfg);
      const params: Record<string, unknown> = { email };
      if (opts.name) params.name = opts.name;
      const customer = await stripe.customers.create(params as never);
      console.log(`Customer created:`);
      console.log(`  ID:    ${customer.id}`);
      console.log(`  Email: ${customer.email}`);
      console.log(`  Name:  ${customer.name || "(none)"}`);
    });

  // ---- balance ----
  sub
    .command("balance")
    .description("Show account balance")
    .action(async () => {
      const stripe = getStripeClient(cfg);
      const balance = await stripe.balance.retrieve();
      console.log("Account Balance:");
      for (const b of balance.available) {
        console.log(`  Available: $${(b.amount / 100).toFixed(2)} ${b.currency.toUpperCase()}`);
      }
      for (const b of balance.pending) {
        console.log(`  Pending:   $${(b.amount / 100).toFixed(2)} ${b.currency.toUpperCase()}`);
      }
    });
}
