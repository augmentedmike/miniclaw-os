import type { Command } from "commander";
import type { Logger } from "openclaw/plugin-sdk";

interface Ctx {
  program: Command;
  logger: Logger;
}

export function registerContextCommands(_ctx: Ctx): void {
  // mc-context is fully automatic — no user-facing CLI commands yet.
  // Future: /context-status, /context-window inspection commands.
}
