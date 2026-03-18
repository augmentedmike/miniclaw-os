/**
 * mc-reddit — CLI commands (commander integration)
 *
 * Registers the "mc-reddit" command group so the plugin can be used via:
 *   mc mc-reddit <subcommand> [options]
 */

import type { Command } from "commander";

export interface RedditCliContext {
  program: Command;
  vaultBin: string;
  logger: { info: (m: string) => void; warn: (m: string) => void; error: (m: string) => void };
}

export function registerRedditCommands(ctx: RedditCliContext): void {
  const { program } = ctx;

  program
    .command("mc-reddit")
    .description("Reddit integration — browse, post, comment, and moderate");
}
