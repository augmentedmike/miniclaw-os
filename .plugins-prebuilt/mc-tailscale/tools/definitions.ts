import * as fs from "node:fs";
import * as path from "node:path";
import { execFileSync, execSync } from "node:child_process";
import type { AnyAgentTool } from "openclaw/plugin-sdk";
import type { Logger } from "pino";
import type { TailscaleConfig } from "../index.js";

function schema(
  props: Record<string, unknown>,
  required?: string[],
): unknown {
  return {
    type: "object",
    properties: props,
    required: required ?? [],
    additionalProperties: false,
  };
}

function ok(text: string) {
  return {
    content: [{ type: "text" as const, text: text.trim() }],
    details: {},
  };
}

function toolErr(text: string) {
  return {
    content: [{ type: "text" as const, text: text.trim() }],
    isError: true,
    details: {},
  };
}

function runSafe(bin: string, args: string[], timeout = 15_000): string | null {
  try {
    return execFileSync(bin, args, { timeout, encoding: "utf-8" }).trim();
  } catch {
    return null;
  }
}

export function createTailscaleTools(
  cfg: TailscaleConfig,
  logger: Logger,
): AnyAgentTool[] {
  return [
    {
      name: "tailscale_doctor",
      label: "Tailscale Doctor",
      description:
        "Diagnose Tailscale issues — checks binary, daemon, socket, zombie processes, " +
        "install method (Homebrew vs standalone), and connection state.",
      parameters: schema({}) as never,
      execute: async () => {
        logger.info("mc-tailscale/tool doctor: running");
        try {
          const issues: string[] = [];
          const info: string[] = [];

          const binExists = fs.existsSync(cfg.tailscaleBin);
          if (!binExists) {
            issues.push(`Binary not found at ${cfg.tailscaleBin}`);
          } else {
            info.push(`Binary: ${cfg.tailscaleBin}`);
            const version = runSafe(cfg.tailscaleBin, ["version"]);
            if (version) info.push(`Version: ${version}`);

            try {
              const resolved = fs.realpathSync(cfg.tailscaleBin);
              if (resolved.includes("/homebrew/") || resolved.includes("/Cellar/")) {
                issues.push("Installed via Homebrew — Funnel requires App Store or standalone install");
              }
            } catch { /* ignore */ }
          }

          if (!fs.existsSync(cfg.stateDir)) {
            issues.push(`State directory missing: ${cfg.stateDir}`);
          }

          const socketPath = path.join(cfg.stateDir, "tailscaled.sock");
          if (!fs.existsSync(socketPath)) {
            issues.push(`Daemon socket missing: ${socketPath}`);
          }

          // Check zombie processes
          try {
            const ps = execSync("ps aux", { encoding: "utf-8", timeout: 5_000 });
            const procs = ps.split("\n").filter((l) => l.includes("tailscaled") && !l.includes("grep"));
            if (procs.length > 0 && !fs.existsSync(socketPath)) {
              const pids = procs.map((l) => l.trim().split(/\s+/)[1]).join(", ");
              issues.push(`Zombie tailscaled processes (PIDs: ${pids}) — socket missing`);
            }
          } catch { /* ignore */ }

          if (binExists && fs.existsSync(socketPath)) {
            const status = runSafe(cfg.tailscaleBin, ["status", "--json"]);
            if (status) {
              try {
                const parsed = JSON.parse(status);
                info.push(`State: ${parsed.BackendState ?? "Unknown"}`);
              } catch { /* ignore */ }
            }
          }

          const result = [
            ...info.map((i) => `OK: ${i}`),
            ...issues.map((i) => `ISSUE: ${i}`),
            issues.length === 0 ? "\nTailscale is healthy." : `\n${issues.length} issue(s) found.`,
          ].join("\n");

          return ok(result);
        } catch (e: unknown) {
          const msg = e instanceof Error ? e.message : String(e);
          logger.error(`mc-tailscale/tool doctor error: ${msg}`);
          return toolErr(`doctor failed: ${msg}`);
        }
      },
    },
    {
      name: "tailscale_status",
      label: "Tailscale Status",
      description:
        "Show current Tailscale state: connection status, hostname, IPs, peers, " +
        "serve/funnel config, and certificate info.",
      parameters: schema({}) as never,
      execute: async () => {
        logger.info("mc-tailscale/tool status: running");
        try {
          const statusJson = runSafe(cfg.tailscaleBin, ["status", "--json"]);
          if (!statusJson) return toolErr("Could not get Tailscale status. Run tailscale_doctor first.");

          const parsed = JSON.parse(statusJson);
          const self = parsed.Self;
          const peers = Object.values(parsed.Peer ?? {}) as any[];

          const lines = [
            `State: ${parsed.BackendState ?? "Unknown"}`,
            `Hostname: ${self?.HostName ?? "Unknown"}`,
            `DNS: ${self?.DNSName ?? "Unknown"}`,
            `IPs: ${(self?.TailscaleIPs ?? []).join(", ")}`,
            `Peers: ${peers.length} total, ${peers.filter((p: any) => p.Online).length} online`,
          ];

          const serveStatus = runSafe(cfg.tailscaleBin, ["serve", "status"]);
          if (serveStatus?.trim()) lines.push(`Serve: ${serveStatus}`);

          if (self?.KeyExpiry) {
            const days = Math.round((new Date(self.KeyExpiry).getTime() - Date.now()) / 86_400_000);
            lines.push(`Key expiry: ${self.KeyExpiry} (${days} days)`);
          }

          return ok(lines.join("\n"));
        } catch (e: unknown) {
          const msg = e instanceof Error ? e.message : String(e);
          return toolErr(`status failed: ${msg}`);
        }
      },
    },
    {
      name: "tailscale_harden",
      label: "Tailscale Harden",
      description:
        "Apply Tailscale hardening settings: shields-up, disable route acceptance, " +
        "auto-updates, and Tailscale SSH. Use dry_run=true to preview commands.",
      parameters: schema(
        { dry_run: { type: "boolean", description: "Preview commands without applying" } },
      ) as never,
      execute: async (params: { dry_run?: boolean }) => {
        logger.info("mc-tailscale/tool harden: running");
        const dryRun = params.dry_run ?? false;
        const cmds = [
          ["set", "--shields-up=true"],
          ["set", "--accept-routes=false"],
          ["set", "--auto-update=true"],
          ["set", "--ssh=true"],
        ];
        const results: string[] = [];
        for (const args of cmds) {
          const cmdStr = `tailscale ${args.join(" ")}`;
          if (dryRun) {
            results.push(`Would run: ${cmdStr}`);
          } else {
            const out = runSafe(cfg.tailscaleBin, args);
            results.push(out !== null ? `Applied: ${cmdStr}` : `Failed: ${cmdStr}`);
          }
        }
        results.push("\nManual steps: review ACLs, set key expiry, consider tailnet lock.");
        return ok(results.join("\n"));
      },
    },
  ];
}
