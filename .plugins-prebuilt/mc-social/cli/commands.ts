import type { Command } from "commander";
import { engagementLogPath, readJsonArray } from "../shared.js";

type Logger = { info(m: string): void; warn(m: string): void; error(m: string): void };

export function registerSocialCommands(
  ctx: { program: Command; logger: Logger }
): void {
  const { program } = ctx;

  const cmd = program
    .command("social")
    .description("GitHub social engagement tools");

  cmd
    .command("status")
    .description("Show engagement metrics summary")
    .action(() => {
      const logFile = engagementLogPath();
      const log = readJsonArray(logFile) as Array<{
        repo: string;
        action: string;
        url: string;
        description: string;
        timestamp: string;
      }>;

      if (log.length === 0) {
        console.log("No engagement activity logged yet.");
        return;
      }

      const total = log.length;

      // By type
      const byType: Record<string, number> = {};
      for (const entry of log) {
        byType[entry.action] = (byType[entry.action] || 0) + 1;
      }

      // By repo
      const byRepo: Record<string, number> = {};
      for (const entry of log) {
        byRepo[entry.repo] = (byRepo[entry.repo] || 0) + 1;
      }

      // This week
      const oneWeekAgo = new Date();
      oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
      const thisWeek = log.filter((e) => new Date(e.timestamp) >= oneWeekAgo).length;

      console.log(`Engagement Summary`);
      console.log(`==================`);
      console.log(`Total actions: ${total}`);
      console.log(`This week:     ${thisWeek}`);
      console.log();
      console.log(`By Type:`);
      for (const [type, count] of Object.entries(byType).sort((a, b) => b[1] - a[1])) {
        console.log(`  ${type}: ${count}`);
      }
      console.log();
      console.log(`By Repo:`);
      for (const [repo, count] of Object.entries(byRepo).sort((a, b) => b[1] - a[1])) {
        console.log(`  ${repo}: ${count}`);
      }

      // Show last 5 entries
      console.log();
      console.log(`Recent Activity:`);
      const recent = log.slice(-5).reverse();
      for (const entry of recent) {
        const date = new Date(entry.timestamp).toLocaleDateString();
        console.log(`  [${date}] ${entry.action} on ${entry.repo} — ${entry.description}`);
      }
    });
}
