import * as readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import type { Command } from "commander";
import type { Logger } from "openclaw/plugin-sdk";
import type { SquareConfig } from "../src/config.js";
import { SquareClient } from "../src/client.js";
import { getSquareAccessToken, saveSquareAccessToken } from "../src/vault.js";

interface Ctx {
  program: Command;
  cfg: SquareConfig;
  logger: Logger;
}

export function registerSquareCommands(ctx: Ctx): void {
  const { program, cfg } = ctx;

  const sub = program
    .command("mc-square")
    .description("Square payment service — charge, refund, payment links");

  // ---- setup ----
  sub
    .command("setup")
    .description("Guided walkthrough: paste access token, vault it, verify, list locations")
    .action(async () => {
      const existing = getSquareAccessToken(cfg.vaultBin);
      if (existing) {
        console.log(`Square access token found in vault (${existing.substring(0, 8)}...).`);
        console.log("Verifying with locations list...");
        try {
          const client = new SquareClient(cfg);
          const locations = await client.listLocations();
          console.log(`OK — ${locations.length} location(s):`);
          for (const loc of locations) {
            console.log(`  [${loc.id}] ${loc.name} (${loc.status})`);
          }
          if (!cfg.locationId) {
            console.log();
            console.log("Set your locationId in plugin config to use charge/refund commands.");
          }
          return;
        } catch (e: unknown) {
          console.error(`Verification failed: ${(e as Error).message}`);
          console.log("Your token may be invalid. Re-run setup to replace it.");
        }
      }

      const rl = readline.createInterface({ input, output });
      console.log();
      console.log("=== Square Setup ===");
      console.log();
      console.log("1. Go to https://developer.squareup.com/apps");
      console.log("2. Create an application (or select existing)");
      console.log(`3. Copy your ${cfg.environment === "sandbox" ? "Sandbox" : "Production"} Access Token`);
      console.log();

      const token = await rl.question("Paste your Square Access Token: ");
      rl.close();

      if (!token.trim()) {
        console.error("No token entered, aborted.");
        process.exit(1);
      }

      saveSquareAccessToken(cfg.vaultBin, token.trim());
      console.log("Token saved to vault.");

      console.log("Verifying with locations list...");
      try {
        const client = new SquareClient({ ...cfg });
        const locations = await client.listLocations();
        console.log(`OK — ${locations.length} location(s):`);
        for (const loc of locations) {
          console.log(`  [${loc.id}] ${loc.name} (${loc.status})`);
        }
        console.log();
        console.log("Square setup complete.");
        if (!cfg.locationId && locations.length > 0) {
          console.log(`Set locationId to "${locations[0].id}" in your plugin config.`);
        }
      } catch (e: unknown) {
        console.error(`Verification failed: ${(e as Error).message}`);
        console.error("Token was saved but may be invalid. Check your Square dashboard.");
        process.exit(1);
      }
    });

  // ---- charge ----
  sub
    .command("charge <amount> <currency> <description>")
    .description("Create a payment (amount in dollars, e.g. 19.99)")
    .option("--customer <id>", "Square customer ID")
    .action(async (amount: string, currency: string, description: string, opts: { customer?: string }) => {
      const dollars = parseFloat(amount);
      if (isNaN(dollars) || dollars <= 0) {
        console.error("Amount must be a positive number (in dollars).");
        process.exit(1);
      }
      const cents = Math.round(dollars * 100);
      const client = new SquareClient(cfg);
      const payment = await client.createPayment(cents, currency, description, opts.customer);
      console.log("Payment created:");
      console.log(`  ID:       ${payment.id}`);
      console.log(`  Amount:   $${(payment.amount / 100).toFixed(2)} ${payment.currency}`);
      console.log(`  Status:   ${payment.status}`);
      if (payment.receiptUrl) console.log(`  Receipt:  ${payment.receiptUrl}`);
    });

  // ---- refund ----
  sub
    .command("refund <payment-id>")
    .description("Full or partial refund")
    .option("--amount <dollars>", "Partial refund amount in dollars")
    .option("--reason <reason>", "Refund reason")
    .action(async (paymentId: string, opts: { amount?: string; reason?: string }) => {
      const client = new SquareClient(cfg);
      let amountCents: number | undefined;
      if (opts.amount) {
        const dollars = parseFloat(opts.amount);
        if (isNaN(dollars) || dollars <= 0) {
          console.error("Refund amount must be a positive number.");
          process.exit(1);
        }
        amountCents = Math.round(dollars * 100);
      }
      const refund = await client.refundPayment(paymentId, amountCents, opts.reason);
      console.log("Refund created:");
      console.log(`  ID:     ${refund.id}`);
      console.log(`  Amount: $${(refund.amount / 100).toFixed(2)}`);
      console.log(`  Status: ${refund.status}`);
    });

  // ---- status ----
  sub
    .command("status <payment-id>")
    .description("Payment details")
    .action(async (paymentId: string) => {
      const client = new SquareClient(cfg);
      const p = await client.getPayment(paymentId);
      console.log(`Payment: ${p.id}`);
      console.log(`  Amount:    $${(p.amount / 100).toFixed(2)} ${p.currency}`);
      console.log(`  Status:    ${p.status}`);
      console.log(`  Note:      ${p.note || "(none)"}`);
      console.log(`  Created:   ${p.createdAt}`);
      if (p.receiptUrl) console.log(`  Receipt:   ${p.receiptUrl}`);
    });

  // ---- link ----
  sub
    .command("link <amount> <title>")
    .description("Create a hosted checkout URL (payment link)")
    .option("--description <desc>", "Link description")
    .action(async (amount: string, title: string, opts: { description?: string }) => {
      const dollars = parseFloat(amount);
      if (isNaN(dollars) || dollars <= 0) {
        console.error("Amount must be a positive number.");
        process.exit(1);
      }
      const cents = Math.round(dollars * 100);
      const client = new SquareClient(cfg);
      const link = await client.createPaymentLink(cents, title, opts.description);
      console.log("Payment link created:");
      console.log(`  ID:       ${link.id}`);
      console.log(`  URL:      ${link.url}`);
      console.log(`  Order ID: ${link.orderId}`);
    });

  // ---- locations ----
  sub
    .command("locations")
    .description("List account locations")
    .action(async () => {
      const client = new SquareClient(cfg);
      const locations = await client.listLocations();
      if (!locations.length) {
        console.log("No locations found.");
        return;
      }
      for (const loc of locations) {
        console.log(`[${loc.id}] ${loc.name} (${loc.status})`);
      }
    });
}
