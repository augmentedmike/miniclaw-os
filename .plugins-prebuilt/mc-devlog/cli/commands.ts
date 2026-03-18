/**
 * mc-devlog CLI commands
 *
 * - openclaw mc-devlog run     — generate and publish devlog for yesterday
 * - openclaw mc-devlog preview — dry-run: show devlog without publishing
 */

import type { Command } from "commander";
import type { Logger } from "openclaw/plugin-sdk";
import type { DevlogConfig } from "../src/types.js";
import { gatherAll } from "../src/gather.js";
import { formatDevlog } from "../src/format.js";
import { publishAll, type PublishResult } from "../src/publish.js";

interface Ctx {
  program: Command;
  logger: Logger;
}

export function registerDevlogCommands(ctx: Ctx, config: DevlogConfig): void {
  const { program, logger } = ctx;

  const devlog = program
    .command("mc-devlog")
    .description("Daily devlog — aggregate git activity and publish");

  // ---- run ----
  devlog
    .command("run")
    .description("Generate and publish yesterday's devlog to all configured targets")
    .action(() => {
      logger.info("mc-devlog: gathering yesterday's activity...");
      const activity = gatherAll(config);

      if (activity.commits.length === 0 && activity.prs.length === 0 && activity.shippedCards.length === 0) {
        console.log("No activity found for yesterday. Skipping devlog.");
        return;
      }

      logger.info(`mc-devlog: found ${activity.commits.length} commits, ${activity.prs.length} PRs, ${activity.issues.length} issues`);

      const post = formatDevlog(activity, config);
      console.log("\n--- Generated Devlog ---");
      console.log(post.markdown);
      console.log("--- End Devlog ---\n");

      console.log("Publishing...");
      const results = publishAll(post, config);

      for (const r of results) {
        const status = r.success ? "\u2713" : "\u2717";
        const detail = r.success ? (r.url ?? "") : (r.error ?? "unknown error");
        console.log(`  ${status} ${r.target}: ${detail}`);
      }

      const failures = results.filter((r) => !r.success);
      if (failures.length > 0) {
        console.error(`\n${failures.length} target(s) failed.`);
        process.exitCode = 1;
      } else {
        console.log("\nAll targets published successfully.");
      }
    });

  // ---- preview ----
  devlog
    .command("preview")
    .description("Dry-run: show what yesterday's devlog would look like without publishing")
    .action(() => {
      logger.info("mc-devlog: preview mode — gathering yesterday's activity...");
      const activity = gatherAll(config);

      if (activity.commits.length === 0 && activity.prs.length === 0 && activity.shippedCards.length === 0) {
        console.log("No activity found for yesterday.");
        return;
      }

      const post = formatDevlog(activity, config);

      console.log(post.markdown);
      console.log("---");
      console.log(`Commits: ${activity.commits.length}`);
      console.log(`PRs merged: ${activity.prs.length}`);
      console.log(`Issues closed: ${activity.issues.length}`);
      console.log(`Shipped cards: ${activity.shippedCards.length}`);
      console.log(`Contributors: ${activity.contributors.join(", ")}`);
      console.log("\n(preview mode — nothing was published)");
    });
}
