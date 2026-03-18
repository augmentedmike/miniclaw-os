import type { Command } from "commander";
import {
  readFanRegistry,
  readEngagementLog,
  addFan,
  getFanById,
  type Fan,
} from "../shared.js";

type Logger = { info(m: string): void; warn(m: string): void; error(m: string): void };

function slugify(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

export function registerFanCommands(
  ctx: { program: Command; logger: Logger },
): void {
  const { program } = ctx;

  const cmd = program.command("fan").description("Fan registry and engagement tools");

  cmd
    .command("list")
    .description("List all fans in the registry")
    .option("-p, --platform <platform>", "Filter by platform")
    .action((opts: { platform?: string }) => {
      let fans = readFanRegistry();
      if (opts.platform) {
        fans = fans.filter((f) => f.platform === opts.platform);
      }

      if (fans.length === 0) {
        console.log("No fans in the registry.");
        return;
      }

      console.log(`Fan Registry (${fans.length})`);
      console.log("=".repeat(40));
      for (const fan of fans) {
        const checked = fan.lastChecked
          ? new Date(fan.lastChecked).toLocaleDateString()
          : "never";
        console.log(`\n${fan.name} [${fan.platform}] (${fan.engagementStyle})`);
        console.log(`  ID: ${fan.id}`);
        console.log(`  Why: ${fan.whyWeFollow}`);
        console.log(`  URLs: ${fan.urls.join(", ")}`);
        console.log(`  Tags: ${fan.tags.join(", ") || "none"}`);
        console.log(`  Last checked: ${checked}`);
        if (fan.notes) console.log(`  Notes: ${fan.notes}`);
      }
    });

  cmd
    .command("add")
    .description("Add a fan to the registry")
    .requiredOption("-n, --name <name>", "Name of the person/project")
    .requiredOption("-p, --platform <platform>", "Platform (youtube, github, twitter, blog, other)")
    .requiredOption("-u, --url <urls...>", "URLs to follow")
    .requiredOption("-w, --why <reason>", "Why we follow them")
    .option("-s, --style <style>", "Engagement style", "intellectual-peer")
    .option("-t, --tags <tags...>", "Tags for categorization")
    .option("--notes <notes>", "Additional notes")
    .action(
      (opts: {
        name: string;
        platform: string;
        url: string[];
        why: string;
        style: string;
        tags?: string[];
        notes?: string;
      }) => {
        const fan: Fan = {
          id: slugify(opts.name),
          name: opts.name,
          platform: opts.platform as Fan["platform"],
          urls: opts.url,
          whyWeFollow: opts.why,
          engagementStyle: opts.style as Fan["engagementStyle"],
          tags: opts.tags || [],
          addedAt: new Date().toISOString(),
          notes: opts.notes,
        };
        addFan(fan);
        console.log(`Added fan: ${fan.name} (${fan.platform})`);
      },
    );

  cmd
    .command("check <id>")
    .description("Show details for a specific fan")
    .action((id: string) => {
      const fan = getFanById(id);
      if (!fan) {
        console.log(`Fan not found: ${id}`);
        return;
      }
      console.log(JSON.stringify(fan, null, 2));
    });

  cmd
    .command("status")
    .description("Show engagement overview for all fans")
    .action(() => {
      const fans = readFanRegistry();
      const log = readEngagementLog();

      if (fans.length === 0) {
        console.log("No fans in the registry.");
        return;
      }

      const counts: Record<string, number> = {};
      const lastAction: Record<string, string> = {};
      for (const entry of log) {
        counts[entry.fanId] = (counts[entry.fanId] || 0) + 1;
        if (!lastAction[entry.fanId] || entry.timestamp > lastAction[entry.fanId]) {
          lastAction[entry.fanId] = entry.timestamp;
        }
      }

      console.log(`Fan Status (${fans.length} fans, ${log.length} total engagements)`);
      console.log("=".repeat(50));

      for (const fan of fans) {
        const count = counts[fan.id] || 0;
        const last = lastAction[fan.id]
          ? new Date(lastAction[fan.id]).toLocaleDateString()
          : "never";
        const checked = fan.lastChecked
          ? new Date(fan.lastChecked).toLocaleDateString()
          : "never";
        const flag = count === 0 ? " [NEEDS ATTENTION]" : "";
        console.log(`\n${fan.name} (${fan.platform})${flag}`);
        console.log(`  Engagements: ${count} | Last: ${last} | Content check: ${checked}`);
      }
    });
}
