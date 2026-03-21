import type { AnyAgentTool } from "openclaw/plugin-sdk";
import type { RealtyConfig } from "../src/config.js";
import { searchComps, getPropertyDetails } from "../src/attom.js";
import { execFileSync } from "node:child_process";

function schema(props: Record<string, unknown>, required?: string[]): unknown {
  return { type: "object", properties: props, required: required ?? [], additionalProperties: false };
}

function str(d: string): unknown { return { type: "string", description: d }; }
function optStr(d: string): unknown { return { type: "string", description: d }; }
function optNum(d: string): unknown { return { type: "number", description: d }; }
function optBool(d: string): unknown { return { type: "boolean", description: d }; }

function ok(text: string) { return { content: [{ type: "text" as const, text: text.trim() }], details: {} }; }
function err(text: string) { return { content: [{ type: "text" as const, text: text.trim() }], isError: true, details: {} }; }

function oc(cfg: RealtyConfig, ...args: string[]): string {
  const bin = process.env.OPENCLAW_BIN ?? "openclaw";
  try {
    return execFileSync(bin, args, { encoding: "utf-8", timeout: 30_000 }).trim();
  } catch (e: unknown) {
    return `[error] ${(e as Error).message}`;
  }
}

function fmtUsd(n: number): string {
  return "$" + n.toLocaleString("en-US", { maximumFractionDigits: 0 });
}

export function createRealtyTools(cfg: RealtyConfig): AnyAgentTool[] {
  return [
    /* ── list_property ──────────────────────────────────────────────── */
    {
      name: "realty_list_property",
      label: "List Property",
      description:
        "Create a new property listing. Creates a board card, stores in KB, and generates a listing description. " +
        "Use this when the human wants to list a property for sale.",
      parameters: schema(
        {
          address: str("Street address"),
          city: str("City"),
          state: str("State abbreviation (e.g. FL)"),
          zip: optStr("ZIP code"),
          price: optStr("Asking price (e.g. '$450,000')"),
          beds: optNum("Number of bedrooms"),
          baths: optNum("Number of bathrooms"),
          sqft: optNum("Square footage"),
          description: optStr("Property highlights or features"),
        },
        ["address", "city", "state"],
      ) as never,
      async execute(_id: string, _input: unknown) {
        const p = _input as Record<string, unknown>;
        try {
          const addr = `${p.address}, ${p.city}, ${p.state}${p.zip ? " " + p.zip : ""}`;

          // Store in KB
          const pid = (p.address as string).toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 60);
          const kbData = JSON.stringify({
            address: p.address, city: p.city, state: p.state, zip: p.zip || "",
            askingPrice: p.price || "", beds: p.beds || "", baths: p.baths || "",
            sqft: p.sqft || "", description: p.description || "",
            status: "listed", listedDate: new Date().toISOString().split("T")[0],
          });
          oc(cfg, "mc-kb", "add", `realty-property-${pid}`, "--content", kbData, "--tags", "realty,property");

          // Create board card
          oc(cfg, "mc-board", "create", `Property: ${addr}`, "--tags", "realty,property");

          // Generate description
          const desc = oc(cfg, "mc-docs", "generate", "--prompt",
            `Write a professional MLS-style listing for ${addr}. ${p.beds || "?"}bd/${p.baths || "?"}ba, ${p.sqft || "?"}sqft. ${p.description || ""}`);

          return ok(
            `Property listed: ${addr}\n` +
            `KB entry: realty-property-${pid}\n` +
            `Board card created.\n\n` +
            `Generated Description:\n${desc}\n\n` +
            `Next: run comp-analysis for pricing data, or generate-listing for marketing materials.`,
          );
        } catch (e: unknown) {
          return err(`Failed to list property: ${(e as Error).message}`);
        }
      },
    },

    /* ── comp_analysis ──────────────────────────────────────────────── */
    {
      name: "realty_comp_analysis",
      label: "Comp Analysis",
      description:
        "Run a comparative market analysis (CMA) for a property using ATTOM Data API. " +
        "Returns nearby comparable sales with pricing statistics. Use for pricing guidance.",
      parameters: schema(
        {
          address: str("Subject property street address"),
          city: str("City"),
          state: str("State abbreviation"),
          zip: optStr("ZIP code"),
          radius_miles: optNum("Search radius (default: from config)"),
          lookback_months: optNum("Months to look back (default: from config)"),
        },
        ["address", "city", "state"],
      ) as never,
      async execute(_id: string, _input: unknown) {
        const p = _input as Record<string, unknown>;
        try {
          const comps = await searchComps(cfg, {
            address: p.address as string,
            city: p.city as string,
            state: p.state as string,
            zip: p.zip as string | undefined,
            radiusMiles: p.radius_miles as number | undefined,
            lookbackMonths: p.lookback_months as number | undefined,
          });

          if (!comps.length) return ok("No comparable sales found. Try increasing radius or lookback period.");

          const prices = comps.map((c) => c.salePrice).filter((p) => p > 0);
          const median = (arr: number[]) => {
            const s = [...arr].sort((a, b) => a - b);
            const m = Math.floor(s.length / 2);
            return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
          };

          let subject = null;
          try {
            subject = await getPropertyDetails(cfg, {
              address: p.address as string, city: p.city as string,
              state: p.state as string, zip: p.zip as string | undefined,
            });
          } catch { /* continue without subject details */ }

          const lines = [
            `## CMA: ${p.address}, ${p.city}, ${p.state}`,
            "",
          ];

          if (subject) {
            lines.push(`**Subject:** ${subject.bedrooms}bd/${subject.bathrooms}ba, ${subject.sqft}sqft, built ${subject.yearBuilt}`);
            if (subject.avm) lines.push(`**AVM:** ${fmtUsd(subject.avm)}`);
            lines.push("");
          }

          lines.push(`**${comps.length} Comparable Sales:**`);
          for (const c of comps) {
            const ppsf = c.sqft > 0 ? `$${Math.round(c.salePrice / c.sqft)}/sqft` : "";
            lines.push(`- ${c.address}: ${fmtUsd(c.salePrice)} | ${c.bedrooms}bd/${c.bathrooms}ba | ${c.sqft}sqft | ${ppsf} | ${c.saleDate} | ${c.distanceMiles.toFixed(1)}mi`);
          }

          lines.push("");
          lines.push(`**Summary:** Median ${fmtUsd(median(prices))}, Range ${fmtUsd(Math.min(...prices))}–${fmtUsd(Math.max(...prices))}`);

          // Store in KB
          const pid = (p.address as string).toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 60);
          oc(cfg, "mc-kb", "add", `realty-cma-${pid}`, "--content", JSON.stringify({ comps, median: median(prices) }), "--tags", "realty,cma");

          return ok(lines.join("\n"));
        } catch (e: unknown) {
          return err(`Comp analysis failed: ${(e as Error).message}\nEnsure ATTOM API key is set via: openclaw mc-vault set attom_api_key <key>`);
        }
      },
    },

    /* ── schedule_showing ───────────────────────────────────────────── */
    {
      name: "realty_schedule_showing",
      label: "Schedule Showing",
      description:
        "Schedule property showing slots via mc-booking and sync to mc-calendar. " +
        "Creates time slots for buyers to book. Optionally notifies buyer contacts.",
      parameters: schema(
        {
          address: str("Property address"),
          date: str("Showing date (YYYY-MM-DD)"),
          times: optStr("Comma-separated times (HH:MM), default: 10:00,11:00,14:00,15:00"),
          duration_minutes: optNum("Duration per showing (default: from config)"),
          notify_buyers: optBool("Email buyer contacts from rolodex"),
        },
        ["address", "date"],
      ) as never,
      async execute(_id: string, _input: unknown) {
        const p = _input as Record<string, unknown>;
        try {
          const times = ((p.times as string) || "10:00,11:00,14:00,15:00").split(",").map((t) => t.trim());
          const dur = String((p.duration_minutes as number) || cfg.bookingDurationMinutes);

          for (const time of times) {
            const iso = `${p.date}T${time}:00`;
            oc(cfg, "mc-booking", "slots", "--create", "--time", iso, "--duration", dur, "--label", `Showing: ${p.address}`);
            oc(cfg, "mc-calendar", "add", "--title", `Showing: ${p.address}`, "--start", iso, "--duration", dur);
          }

          if (p.notify_buyers) {
            oc(cfg, "mc-email", "send", "--to-tag", "buyer",
              "--subject", `Open House: ${p.address} — ${p.date}`,
              "--body", `Showing times at ${p.address} on ${p.date}: ${times.join(", ")}. Reply to schedule.`);
          }

          return ok(
            `${times.length} showing slots created for ${p.address} on ${p.date}:\n` +
            times.map((t) => `  ${t} (${dur}min)`).join("\n") +
            `\nSlots synced to calendar.` +
            (p.notify_buyers ? `\nBuyer notifications sent.` : "") +
            `\nUse 'mc-booking pending' to manage requests.`,
          );
        } catch (e: unknown) {
          return err(`Failed to schedule showing: ${(e as Error).message}`);
        }
      },
    },

    /* ── generate_listing ───────────────────────────────────────────── */
    {
      name: "realty_generate_listing",
      label: "Generate Listing",
      description:
        "Generate full listing package: graphics (mc-designer), blog post (mc-blog), and social media posts (mc-social). " +
        "Creates marketing materials for a property.",
      parameters: schema(
        {
          address: str("Property address"),
          city: optStr("City"),
          state: optStr("State"),
          price: optStr("Asking price"),
          beds: optNum("Bedrooms"),
          baths: optNum("Bathrooms"),
          sqft: optNum("Square footage"),
          description: optStr("Property description"),
          syndicate: optBool("Post to social media (default: auto_syndicate config)"),
        },
        ["address"],
      ) as never,
      async execute(_id: string, _input: unknown) {
        const p = _input as Record<string, unknown>;
        try {
          const pid = (p.address as string).toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 60);

          // Designer
          oc(cfg, "mc-designer", "gen",
            `Professional real estate listing graphic for ${p.address}. ${p.beds || "?"}bd/${p.baths || "?"}ba, ${p.sqft || "?"}sqft. Clean MLS style.`,
            "-c", `realty-listing-${pid}`, "--role", "background");
          const graphicPath = `${cfg.dataDir}/listings/${pid}-graphic.png`;
          oc(cfg, "mc-designer", "composite", "-c", `realty-listing-${pid}`, "-o", graphicPath);

          // Blog
          const blogTitle = `${p.address}${p.city ? ", " + p.city : ""} — ${p.beds || "?"}BD/${p.baths || "?"}BA${p.price ? " | " + p.price : ""}`;
          oc(cfg, "mc-blog", "create", "--title", blogTitle, "--body", (p.description as string) || `Property at ${p.address}`, "--tags", "realty,listing", "--publish");

          // Social
          const shouldSyndicate = p.syndicate !== false && cfg.autoSyndicate;
          if (shouldSyndicate) {
            const text = `New Listing: ${p.address}. ${p.beds || "?"}bd/${p.baths || "?"}ba, ${p.sqft || "?"}sqft. ${p.price || "Contact for price"}. DM for details!`;
            for (const platform of cfg.syndicatePlatforms) {
              oc(cfg, "mc-social", "post", "--platform", platform, "--text", text, "--image", graphicPath);
            }
          }

          return ok(
            `Listing package generated for ${p.address}:\n` +
            `- Graphic: ${graphicPath}\n` +
            `- Blog post published\n` +
            (shouldSyndicate ? `- Posted to: ${cfg.syndicatePlatforms.join(", ")}\n` : "") +
            `\nNext: schedule showings or run comp analysis.`,
          );
        } catch (e: unknown) {
          return err(`Failed to generate listing: ${(e as Error).message}`);
        }
      },
    },

    /* ── track_transaction ──────────────────────────────────────────── */
    {
      name: "realty_track_transaction",
      label: "Track Transaction",
      description:
        "Create a transaction tracking pipeline on mc-board with configurable stages " +
        "(listed → showings → offers → under-contract → inspection → appraisal → closing → sold). " +
        "Tracks buyer info, price, and sends status notifications.",
      parameters: schema(
        {
          address: str("Property address"),
          buyer: optStr("Buyer name"),
          buyer_email: optStr("Buyer email"),
          price: optStr("Offer/contract price"),
          stage: optStr("Initial stage (default: first configured stage)"),
        },
        ["address"],
      ) as never,
      async execute(_id: string, _input: unknown) {
        const p = _input as Record<string, unknown>;
        try {
          const stage = (p.stage as string) || cfg.transactionStages[0];
          const pipeline = cfg.transactionStages.map((s) => (s === stage ? `[${s}]` : s)).join(" → ");

          const criteria = cfg.transactionStages.map((s) => `- [ ] ${s}`).join("\n");
          oc(cfg, "mc-board", "create", `Transaction: ${p.address}`,
            "--tags", `realty,transaction,${stage}`,
            "--notes", `Buyer: ${p.buyer || "TBD"}\nPrice: ${p.price || "TBD"}\nPipeline: ${pipeline}`,
            "--criteria", criteria);

          if (p.buyer) {
            oc(cfg, "mc-rolodex", "add", (p.buyer as string).toLowerCase().replace(/\s+/g, "-"),
              "--name", p.buyer as string, "--email", (p.buyer_email as string) || "",
              "--tags", "realty,buyer", "--notes", `Buyer for ${p.address}`);
          }

          oc(cfg, "mc-kb", "add", `realty-tx-${(p.address as string).toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 60)}`,
            "--content", JSON.stringify({ property: p.address, buyer: p.buyer, price: p.price, stage, created: new Date().toISOString() }),
            "--tags", "realty,transaction");

          if (cfg.notificationEmail) {
            oc(cfg, "mc-email", "send", "--to", cfg.notificationEmail,
              "--subject", `Transaction Started: ${p.address}`,
              "--body", `Transaction tracking for ${p.address}. Stage: ${stage}. Buyer: ${p.buyer || "TBD"}. Price: ${p.price || "TBD"}.`);
          }

          return ok(
            `Transaction pipeline created for ${p.address}\n` +
            `Stage: ${stage}\n` +
            `Pipeline: ${pipeline}\n` +
            (p.buyer ? `Buyer: ${p.buyer}\n` : "") +
            (p.price ? `Price: ${p.price}\n` : "") +
            `\nUse mc-board to advance stages.`,
          );
        } catch (e: unknown) {
          return err(`Failed to create transaction: ${(e as Error).message}`);
        }
      },
    },

    /* ── market_report ──────────────────────────────────────────────── */
    {
      name: "realty_market_report",
      label: "Market Report",
      description:
        "Generate a market report for a given area using mc-research and mc-docs. " +
        "Emails the report to the client if configured.",
      parameters: schema(
        {
          market: str("Market area (e.g. 'Miami-Fort Lauderdale' or ZIP code)"),
          email: optStr("Recipient email (default: notification_email from config)"),
        },
        ["market"],
      ) as never,
      async execute(_id: string, _input: unknown) {
        const p = _input as Record<string, unknown>;
        try {
          const market = p.market as string;
          const email = (p.email as string) || cfg.notificationEmail;

          const research = oc(cfg, "mc-research", "search",
            `${market} real estate market ${new Date().getFullYear()} median price inventory days on market`);

          const report = oc(cfg, "mc-docs", "generate", "--prompt",
            `Professional real estate market report for ${market}. Include median price, trends, inventory, days on market. Data: ${research}`);

          const reportDate = new Date().toISOString().split("T")[0];
          oc(cfg, "mc-kb", "add", `realty-market-${market.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${reportDate}`,
            "--content", report || research, "--tags", "realty,market-report");

          if (email) {
            oc(cfg, "mc-email", "send", "--to", email,
              "--subject", `Market Report: ${market} — ${reportDate}`,
              "--body", report || `Market data for ${market} on ${reportDate}`);
          }

          return ok(
            `## Market Report: ${market}\n` +
            `Date: ${reportDate}\n\n` +
            (report || research || "Report generated — see KB for details.") +
            (email ? `\n\nReport emailed to ${email}.` : ""),
          );
        } catch (e: unknown) {
          return err(`Failed to generate market report: ${(e as Error).message}`);
        }
      },
    },
  ];
}
