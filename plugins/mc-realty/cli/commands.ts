import type { Command } from "commander";
import type { Logger } from "openclaw/plugin-sdk";
import type { RealtyConfig } from "../src/config.js";
import { searchComps, getPropertyDetails } from "../src/attom.js";
import { execFileSync } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";

interface Ctx {
  program: Command;
  cfg: RealtyConfig;
  logger: Logger;
}

/* ── helpers ────────────────────────────────────────────────────────── */

function ocBin(): string {
  return process.env.OPENCLAW_BIN ?? "openclaw";
}

function run(bin: string, args: string[], opts?: { input?: string }): string {
  try {
    return execFileSync(bin, args, {
      encoding: "utf-8",
      timeout: 30_000,
      input: opts?.input,
    }).trim();
  } catch (e: unknown) {
    return `[exec error] ${(e as Error).message}`;
  }
}

/** Run an openclaw plugin CLI command */
function oc(...args: string[]): string {
  return run(ocBin(), args);
}

function ensureDir(dir: string): void {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function fmtUsd(n: number): string {
  return "$" + n.toLocaleString("en-US", { maximumFractionDigits: 0 });
}

function propertyId(address: string): string {
  return address
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 60);
}

/* ── register ───────────────────────────────────────────────────────── */

export function registerRealtyCommands(ctx: Ctx): void {
  const { program, cfg, logger } = ctx;

  const sub = program
    .command("mc-realty")
    .description("Real estate workflow orchestration — listings, comps, showings, transactions, reports");

  /* ── list-property ────────────────────────────────────────────────── */

  sub
    .command("list-property")
    .description("Create a property listing — board card + KB entry + description via mc-docs")
    .requiredOption("--address <addr>", "Street address")
    .requiredOption("--city <city>", "City")
    .requiredOption("--state <st>", "State abbreviation")
    .option("--zip <zip>", "ZIP code")
    .option("--price <price>", "Asking price")
    .option("--beds <n>", "Bedrooms")
    .option("--baths <n>", "Bathrooms")
    .option("--sqft <n>", "Square footage")
    .option("--description <text>", "Property highlights")
    .action(async (opts: Record<string, string>) => {
      const pid = propertyId(opts.address);
      logger.info(`Listing property: ${opts.address}, ${opts.city}, ${opts.state}`);

      // 1. Store property data in mc-kb
      const kbData = JSON.stringify({
        address: opts.address,
        city: opts.city,
        state: opts.state,
        zip: opts.zip || "",
        askingPrice: opts.price || "",
        beds: opts.beds || "",
        baths: opts.baths || "",
        sqft: opts.sqft || "",
        description: opts.description || "",
        status: "listed",
        listedDate: new Date().toISOString().split("T")[0],
      });
      oc("mc-kb", "add", `realty-property-${pid}`, "--content", kbData, "--tags", "realty,property,listing");
      console.log(`  KB entry created: realty-property-${pid}`);

      // 2. Create mc-board card for tracking
      const title = `Property: ${opts.address}, ${opts.city} ${opts.state}`;
      const cardNotes = [
        `Address: ${opts.address}, ${opts.city}, ${opts.state} ${opts.zip || ""}`,
        opts.price ? `Asking: ${opts.price}` : "",
        opts.beds ? `Beds: ${opts.beds}` : "",
        opts.baths ? `Baths: ${opts.baths}` : "",
        opts.sqft ? `Sqft: ${opts.sqft}` : "",
        `KB: realty-property-${pid}`,
      ]
        .filter(Boolean)
        .join("\n");

      oc("mc-board", "create", title, "--tags", "realty,property", "--notes", cardNotes);
      console.log(`  Board card created: ${title}`);

      // 3. Add to mc-rolodex as a property contact if notification email set
      if (cfg.notificationEmail) {
        oc("mc-rolodex", "add", pid, "--email", cfg.notificationEmail, "--tags", "realty,seller", "--notes", `Property: ${opts.address}`);
        console.log(`  Rolodex entry created for seller`);
      }

      // 4. Generate listing description via mc-docs
      const prompt = `Write a compelling real estate listing description for: ${opts.address}, ${opts.city}, ${opts.state}. ${opts.beds || "?"} beds, ${opts.baths || "?"} baths, ${opts.sqft || "?"} sqft. ${opts.description || ""}. Write in a professional MLS style.`;
      const desc = oc("mc-docs", "generate", "--prompt", prompt);
      if (desc && !desc.startsWith("[exec error]")) {
        console.log(`\n--- Generated Listing Description ---\n${desc}\n`);
      }

      // 5. Save listing data locally
      ensureDir(cfg.dataDir);
      const listingFile = path.join(cfg.dataDir, `${pid}.json`);
      fs.writeFileSync(listingFile, JSON.stringify({ ...JSON.parse(kbData), generatedDescription: desc }, null, 2));
      console.log(`  Listing data saved: ${listingFile}`);
      console.log(`\nProperty listed successfully. Use 'mc-realty comp-analysis' to get pricing data.`);
    });

  /* ── comp-analysis ────────────────────────────────────────────────── */

  sub
    .command("comp-analysis")
    .description("Pull comps from ATTOM API and generate CMA report")
    .requiredOption("--address <addr>", "Subject property street address")
    .requiredOption("--city <city>", "City")
    .requiredOption("--state <st>", "State abbreviation")
    .option("--zip <zip>", "ZIP code")
    .option("--radius <miles>", "Search radius in miles")
    .option("--months <n>", "Lookback period in months")
    .option("--max <n>", "Maximum number of comps to return")
    .action(async (opts: Record<string, string>) => {
      const pid = propertyId(opts.address);
      logger.info(`Running comp analysis for ${opts.address}`);

      console.log(`Searching for comps within ${opts.radius || cfg.compRadiusMiles}mi, last ${opts.months || cfg.compLookbackMonths} months...`);

      try {
        // 1. Fetch comps from ATTOM
        const comps = await searchComps(cfg, {
          address: opts.address,
          city: opts.city,
          state: opts.state,
          zip: opts.zip,
          radiusMiles: opts.radius ? parseFloat(opts.radius) : undefined,
          lookbackMonths: opts.months ? parseInt(opts.months, 10) : undefined,
          maxResults: opts.max ? parseInt(opts.max, 10) : undefined,
        });

        if (!comps.length) {
          console.log("No comparable sales found. Try increasing radius or lookback period.");
          return;
        }

        // 2. Calculate statistics
        const prices = comps.map((c) => c.salePrice).filter((p) => p > 0);
        const priceSqft = comps.map((c) => (c.sqft > 0 ? c.salePrice / c.sqft : 0)).filter((p) => p > 0);
        const median = (arr: number[]) => {
          const sorted = [...arr].sort((a, b) => a - b);
          const mid = Math.floor(sorted.length / 2);
          return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
        };
        const avg = (arr: number[]) => arr.reduce((a, b) => a + b, 0) / arr.length;

        // 3. Get subject property details
        let subject = null;
        try {
          subject = await getPropertyDetails(cfg, {
            address: opts.address,
            city: opts.city,
            state: opts.state,
            zip: opts.zip,
          });
        } catch {
          logger.info("Could not fetch subject property details — continuing with comps only");
        }

        // 4. Print CMA report
        console.log(`\n${"=".repeat(60)}`);
        console.log(`  COMPARATIVE MARKET ANALYSIS (CMA)`);
        console.log(`  Subject: ${opts.address}, ${opts.city}, ${opts.state}`);
        console.log(`${"=".repeat(60)}\n`);

        if (subject) {
          console.log(`Subject Property:`);
          console.log(`  ${subject.bedrooms} bed / ${subject.bathrooms} bath / ${subject.sqft} sqft / Built ${subject.yearBuilt}`);
          if (subject.avm) console.log(`  AVM (Automated Valuation): ${fmtUsd(subject.avm)}`);
          if (subject.assessedValue) console.log(`  Assessed Value: ${fmtUsd(subject.assessedValue)}`);
          if (subject.lastSalePrice) console.log(`  Last Sale: ${fmtUsd(subject.lastSalePrice)} (${subject.lastSaleDate})`);
          console.log();
        }

        console.log(`Comparable Sales (${comps.length} found):\n`);
        for (const c of comps) {
          const pricePerSqft = c.sqft > 0 ? Math.round(c.salePrice / c.sqft) : 0;
          console.log(`  ${c.address}, ${c.city} ${c.state} ${c.zip}`);
          console.log(`    ${fmtUsd(c.salePrice)} | ${c.bedrooms}bd/${c.bathrooms}ba | ${c.sqft}sqft | $${pricePerSqft}/sqft | ${c.saleDate} | ${c.distanceMiles.toFixed(1)}mi`);
        }

        console.log(`\nMarket Summary:`);
        console.log(`  Median Sale Price:   ${fmtUsd(median(prices))}`);
        console.log(`  Average Sale Price:  ${fmtUsd(Math.round(avg(prices)))}`);
        console.log(`  Price Range:         ${fmtUsd(Math.min(...prices))} – ${fmtUsd(Math.max(...prices))}`);
        if (priceSqft.length) {
          console.log(`  Median $/sqft:       $${Math.round(median(priceSqft))}`);
          console.log(`  Average $/sqft:      $${Math.round(avg(priceSqft))}`);
        }
        console.log();

        // 5. Store results in mc-kb
        const cmaData = {
          subject: opts.address,
          date: new Date().toISOString().split("T")[0],
          comps: comps.length,
          medianPrice: median(prices),
          avgPrice: Math.round(avg(prices)),
          medianPriceSqft: priceSqft.length ? Math.round(median(priceSqft)) : null,
          avm: subject?.avm ?? null,
          compDetails: comps,
        };
        oc("mc-kb", "add", `realty-cma-${pid}`, "--content", JSON.stringify(cmaData), "--tags", "realty,cma,comps");
        console.log(`CMA stored in KB: realty-cma-${pid}`);

        // 6. Run supplementary research via mc-research
        const researchQuery = `Real estate market trends ${opts.city} ${opts.state} ${new Date().getFullYear()} median home prices inventory`;
        oc("mc-research", "search", researchQuery);
        console.log(`Market research initiated via mc-research`);
      } catch (e: unknown) {
        console.error(`Comp analysis failed: ${(e as Error).message}`);
        console.error(`Ensure ATTOM API key is set: openclaw mc-vault set attom_api_key <your-key>`);
        process.exit(1);
      }
    });

  /* ── schedule-showing ─────────────────────────────────────────────── */

  sub
    .command("schedule-showing")
    .description("Create showing slots for a property via mc-booking + mc-calendar")
    .requiredOption("--address <addr>", "Property address")
    .requiredOption("--date <date>", "Showing date (YYYY-MM-DD)")
    .option("--times <times>", "Comma-separated times (HH:MM), e.g. 10:00,11:00,14:00")
    .option("--duration <min>", "Duration in minutes")
    .option("--notify-buyers", "Email buyer contacts from mc-rolodex")
    .action(async (opts: Record<string, string | boolean>) => {
      const duration = (opts.duration as string) || String(cfg.bookingDurationMinutes);
      const times = ((opts.times as string) || "10:00,11:00,14:00,15:00").split(",").map((t) => t.trim());
      const address = opts.address as string;
      const date = opts.date as string;

      logger.info(`Scheduling showings for ${address} on ${date}`);
      console.log(`Creating ${times.length} showing slots for ${address} on ${date}...`);

      for (const time of times) {
        const isoTime = `${date}T${time}:00`;
        // Create booking slot via mc-booking
        oc(
          "mc-booking",
          "slots",
          "--create",
          "--time",
          isoTime,
          "--duration",
          duration,
          "--label",
          `Showing: ${address}`,
        );
        console.log(`  Slot created: ${date} ${time} (${duration}min)`);

        // Sync to mc-calendar
        oc(
          "mc-calendar",
          "add",
          "--title",
          `Showing: ${address}`,
          "--start",
          isoTime,
          "--duration",
          duration,
          "--notes",
          `Property showing at ${address}`,
        );
      }

      console.log(`\n${times.length} showing slots created and synced to calendar.`);

      // Optionally notify buyers from rolodex
      if (opts["notify-buyers"]) {
        const buyers = oc("mc-rolodex", "search", "--tags", "buyer,realty");
        if (buyers && !buyers.startsWith("[exec error]")) {
          const subject = `Open House: ${address} — ${date}`;
          const body = `Showing times available at ${address} on ${date}: ${times.join(", ")}. Reply to schedule your visit or book online.`;
          oc("mc-email", "send", "--to-tag", "buyer", "--subject", subject, "--body", body);
          console.log(`Buyer notification emails sent via mc-email`);
        }
      }

      console.log(`\nUse 'openclaw mc-booking pending' to manage showing requests.`);
    });

  /* ── generate-listing ─────────────────────────────────────────────── */

  sub
    .command("generate-listing")
    .description("Generate listing graphics (mc-designer) + blog post (mc-blog) + syndicate (mc-social)")
    .requiredOption("--address <addr>", "Property address")
    .option("--city <city>", "City")
    .option("--state <st>", "State")
    .option("--price <price>", "Asking price")
    .option("--beds <n>", "Bedrooms")
    .option("--baths <n>", "Bathrooms")
    .option("--sqft <n>", "Square footage")
    .option("--description <text>", "Property description or highlights")
    .option("--no-syndicate", "Skip social media syndication")
    .action(async (opts: Record<string, string | boolean>) => {
      const address = opts.address as string;
      const pid = propertyId(address);
      logger.info(`Generating listing for ${address}`);

      // 1. Generate listing graphic via mc-designer
      console.log(`Generating listing graphics via mc-designer...`);
      const designPrompt = `Professional real estate listing graphic for ${address}${opts.city ? `, ${opts.city}` : ""}. ${opts.beds || "?"}bed/${opts.baths || "?"}bath, ${opts.sqft || "?"}sqft. ${opts.price ? "Asking " + opts.price : ""}. Clean modern design with property details overlay. MLS-style.`;
      oc("mc-designer", "gen", designPrompt, "-c", `realty-listing-${pid}`, "--role", "background");
      ensureDir(path.join(cfg.dataDir, "listings"));
      const graphicPath = path.join(cfg.dataDir, "listings", `${pid}-graphic.png`);
      oc("mc-designer", "composite", "-c", `realty-listing-${pid}`, "-o", graphicPath);
      console.log(`  Listing graphic: ${graphicPath}`);

      // 2. Generate blog listing page via mc-blog
      console.log(`Creating listing blog post via mc-blog...`);
      const blogTitle = `${address}${opts.city ? `, ${opts.city}` : ""} — ${opts.beds || "?"}BD/${opts.baths || "?"}BA${opts.price ? " | " + opts.price : ""}`;
      const blogBody = [
        opts.description || `Beautiful property at ${address}.`,
        "",
        `**Details:**`,
        opts.beds ? `- Bedrooms: ${opts.beds}` : "",
        opts.baths ? `- Bathrooms: ${opts.baths}` : "",
        opts.sqft ? `- Square Feet: ${opts.sqft}` : "",
        opts.price ? `- Asking Price: ${opts.price}` : "",
        "",
        `Contact us to schedule a showing.`,
      ]
        .filter((l) => l !== "")
        .join("\n");

      oc("mc-blog", "create", "--title", blogTitle, "--body", blogBody, "--tags", "realty,listing", "--publish");
      console.log(`  Blog listing published`);

      // 3. Syndicate to social platforms
      const shouldSyndicate = opts.syndicate !== false && cfg.autoSyndicate;
      if (shouldSyndicate) {
        console.log(`Syndicating to ${cfg.syndicatePlatforms.join(", ")} via mc-social...`);
        const socialText = `New Listing: ${address}${opts.city ? `, ${opts.city}` : ""}. ${opts.beds || "?"}bd/${opts.baths || "?"}ba, ${opts.sqft || "?"}sqft. ${opts.price || "Contact for price"}. DM for details or to schedule a showing!`;
        for (const platform of cfg.syndicatePlatforms) {
          oc("mc-social", "post", "--platform", platform, "--text", socialText, "--image", graphicPath);
          console.log(`  Posted to ${platform}`);
        }
      }

      console.log(`\nListing generated successfully.`);
    });

  /* ── track-transaction ────────────────────────────────────────────── */

  sub
    .command("track-transaction")
    .description("Create an mc-board pipeline to track a real estate transaction through stages")
    .requiredOption("--address <addr>", "Property address")
    .option("--buyer <name>", "Buyer name")
    .option("--buyer-email <email>", "Buyer email")
    .option("--price <price>", "Offer/contract price")
    .option("--stage <stage>", "Initial stage (default: listed)")
    .action(async (opts: Record<string, string>) => {
      const address = opts.address;
      const pid = propertyId(address);
      const initialStage = opts.stage || cfg.transactionStages[0];
      logger.info(`Creating transaction pipeline for ${address}`);

      // 1. Create board card for the transaction
      const title = `Transaction: ${address}`;
      const stageList = cfg.transactionStages
        .map((s) => (s === initialStage ? `**[${s}]**` : s))
        .join(" → ");

      const notes = [
        `Property: ${address}`,
        opts.buyer ? `Buyer: ${opts.buyer}` : "",
        opts["buyer-email"] ? `Buyer Email: ${opts["buyer-email"]}` : "",
        opts.price ? `Price: ${opts.price}` : "",
        `\nPipeline: ${stageList}`,
        `Current Stage: ${initialStage}`,
      ]
        .filter(Boolean)
        .join("\n");

      const criteria = cfg.transactionStages
        .map((s) => `- [ ] ${s}`)
        .join("\n");

      oc("mc-board", "create", title, "--tags", `realty,transaction,${initialStage}`, "--notes", notes, "--criteria", criteria);
      console.log(`Transaction card created: ${title}`);
      console.log(`Pipeline: ${cfg.transactionStages.join(" → ")}`);
      console.log(`Current stage: ${initialStage}`);

      // 2. Add buyer to rolodex if provided
      if (opts.buyer) {
        oc(
          "mc-rolodex",
          "add",
          opts.buyer.toLowerCase().replace(/\s+/g, "-"),
          "--name",
          opts.buyer,
          "--email",
          opts["buyer-email"] || "",
          "--tags",
          "realty,buyer",
          "--notes",
          `Buyer for ${address}`,
        );
        console.log(`Buyer added to rolodex: ${opts.buyer}`);
      }

      // 3. Store transaction in mc-kb
      const txData = {
        property: address,
        buyer: opts.buyer || "",
        buyerEmail: opts["buyer-email"] || "",
        price: opts.price || "",
        stage: initialStage,
        stages: cfg.transactionStages,
        created: new Date().toISOString(),
        history: [{ stage: initialStage, date: new Date().toISOString() }],
      };
      oc("mc-kb", "add", `realty-tx-${pid}`, "--content", JSON.stringify(txData), "--tags", "realty,transaction");
      console.log(`Transaction data stored in KB: realty-tx-${pid}`);

      // 4. Send notification if configured
      if (cfg.notificationEmail) {
        oc(
          "mc-email",
          "send",
          "--to",
          cfg.notificationEmail,
          "--subject",
          `Transaction Started: ${address}`,
          "--body",
          `Transaction tracking initiated for ${address}.\nStage: ${initialStage}\n${opts.buyer ? "Buyer: " + opts.buyer : ""}\n${opts.price ? "Price: " + opts.price : ""}`,
        );
        console.log(`Notification sent to ${cfg.notificationEmail}`);
      }

      console.log(`\nUse 'openclaw mc-board update <card-id> --add-tags <next-stage>' to advance stages.`);
    });

  /* ── market-report ────────────────────────────────────────────────── */

  sub
    .command("market-report")
    .description("Generate market report via mc-research and email to client")
    .requiredOption("--market <area>", "Market area (e.g. 'Miami-Fort Lauderdale' or ZIP)")
    .option("--email <addr>", "Recipient email (defaults to notification_email)")
    .action(async (opts: Record<string, string>) => {
      const market = opts.market || cfg.defaultMarket;
      const email = opts.email || cfg.notificationEmail;
      logger.info(`Generating market report for ${market}`);

      // 1. Research market trends via mc-research
      console.log(`Researching market trends for ${market}...`);
      const query = `${market} real estate market report ${new Date().getFullYear()} median home price inventory days on market trends`;
      const research = oc("mc-research", "search", query);
      console.log(`  Research gathered`);

      // 2. Generate formatted report
      const reportPrompt = `Generate a professional real estate market report for ${market}. Include: median home price, price trends, inventory levels, days on market, market conditions (buyer's/seller's). Based on: ${research}`;
      const report = oc("mc-docs", "generate", "--prompt", reportPrompt);

      const reportDate = new Date().toISOString().split("T")[0];
      const reportId = `market-${market.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${reportDate}`;

      // 3. Store in mc-kb
      oc("mc-kb", "add", `realty-${reportId}`, "--content", report || query, "--tags", "realty,market-report");
      console.log(`  Report stored in KB: realty-${reportId}`);

      // 4. Print report
      if (report && !report.startsWith("[exec error]")) {
        console.log(`\n${"=".repeat(60)}`);
        console.log(`  MARKET REPORT: ${market}`);
        console.log(`  Date: ${reportDate}`);
        console.log(`${"=".repeat(60)}\n`);
        console.log(report);
      }

      // 5. Email report if recipient configured
      if (email) {
        oc(
          "mc-email",
          "send",
          "--to",
          email,
          "--subject",
          `Market Report: ${market} — ${reportDate}`,
          "--body",
          report || `Market report for ${market} generated on ${reportDate}. See KB entry: realty-${reportId}`,
        );
        console.log(`\nReport emailed to ${email}`);
      } else {
        console.log(`\nNo email recipient configured. Set notification_email in config or pass --email.`);
      }
    });
}
