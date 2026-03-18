import { join } from "node:path";
import { existsSync } from "node:fs";

interface OpenClawPluginApi {
  config: Record<string, unknown>;
  stateDir: string;
  registerCli: (fn: (ctx: { program: unknown }) => void) => void;
  on: (event: string, fn: (...args: unknown[]) => void) => void;
  log: (...args: unknown[]) => void;
}

export default function register(api: OpenClawPluginApi): void {
  const port = (api.config.port as number) || 4221;
  const claudeBin = (api.config.claudeBin as string) || join(process.env.HOME || "", ".local/bin/claude");
  const workspaceDir = (api.config.workspaceDir as string) || join(api.stateDir, "workspace");

  // Verify claude binary exists
  if (!existsSync(claudeBin)) {
    api.log(`[mc-web-chat] claude binary not found at ${claudeBin} — chat disabled`);
    return;
  }

  // Start WebSocket server
  import("./server.js").then(({ startChatServer }) => {
    startChatServer({ port, claudeBin, workspaceDir });
  }).catch((err) => {
    api.log(`[mc-web-chat] failed to start: ${err}`);
  });

  // CLI commands
  api.registerCli((ctx: { program: { command: (name: string) => { description: (d: string) => { action: (fn: () => void) => void } } } }) => {
    ctx.program
      .command("mc-web-chat status")
      .description("Check mc-web-chat server status")
      .action(async () => {
        try {
          const res = await fetch(`http://127.0.0.1:${port}/health`);
          const data = await res.json();
          console.log(`mc-web-chat: ${data.status} (${data.sessions} active sessions)`);
        } catch {
          console.log("mc-web-chat: not running");
        }
      });
  });
}
