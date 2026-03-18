import type { OpenClawPluginApi } from "openclaw/plugin-sdk";
import { resolveConfig } from "./src/config.js";
import { registerBookingCommands } from "./cli/commands.js";
import { createBookingTools } from "./tools/definitions.js";

export default function register(api: OpenClawPluginApi): void {
  const cfg = resolveConfig((api.pluginConfig ?? {}) as Record<string, unknown>);

  api.logger.info(`mc-booking loaded (db=${cfg.dbPath}, payment=${cfg.paymentProvider})`);

  if (typeof api.hook === "function") api.hook("before_prompt_build", (_ctx) => {
    return {
      prepend:
        `## Scheduling Context\n` +
        `You manage your human's calendar as a scheduling assistant.\n` +
        `Use booking_slots to check availability before proposing times.\n` +
        `Booking requests start as 'pending' — notify your human and wait for approval.\n` +
        `After approval, send a confirmation email to the requester.\n` +
        `Rules: ${cfg.rules.join("; ")}\n`,
    };
  });

  api.registerCli((ctx) => {
    registerBookingCommands({ program: ctx.program, cfg, logger: api.logger });
  });

  for (const tool of createBookingTools(cfg)) {
    api.registerTool(tool);
  }
}
