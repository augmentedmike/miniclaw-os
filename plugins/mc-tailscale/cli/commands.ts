import * as fs from "node:fs";
import * as path from "node:path";
import { execFileSync, execSync } from "node:child_process";
import type { Command } from "commander";
import type { TailscaleConfig } from "../index.js";

export interface CliContext {
  program: Command;
  logger: {
    info: (m: string) => void;
    warn: (m: string) => void;
    error: (m: string) => void;
  };
}

// ── Helpers ─────────────────────────────────────────────────────────

function run(bin: string, args: string[], timeout = 15_000): string {
  try {
    return execFileSync(bin, args, { timeout, encoding: "utf-8" }).trim();
  } catch (e: unknown) {
    const msg = e instanceof Error ? (e as any).stderr?.toString().trim() || e.message : String(e);
    throw new Error(msg);
  }
}

function runSafe(bin: string, args: string[], timeout = 15_000): string | null {
  try {
    return run(bin, args, timeout);
  } catch {
    return null;
  }
}

function isHomebrewInstall(bin: string): boolean {
  try {
    const resolved = fs.realpathSync(bin);
    return resolved.includes("/homebrew/") || resolved.includes("/Cellar/");
  } catch {
    return bin.includes("/homebrew/");
  }
}

function findZombieProcesses(): { pid: number; cmd: string }[] {
  try {
    const out = execSync("ps aux", { encoding: "utf-8", timeout: 5_000 });
    const lines = out.split("\n").filter((l) => l.includes("tailscaled") && !l.includes("grep"));
    return lines.map((l) => {
      const parts = l.trim().split(/\s+/);
      return { pid: parseInt(parts[1], 10), cmd: parts.slice(10).join(" ") };
    }).filter((p) => !isNaN(p.pid));
  } catch {
    return [];
  }
}

// ── Doctor ──────────────────────────────────────────────────────────

function doctorCommand(cfg: TailscaleConfig): void {
  const checks: { label: string; status: "ok" | "warn" | "fail"; detail: string }[] = [];

  // 1. Binary exists
  const binExists = fs.existsSync(cfg.tailscaleBin);
  checks.push({
    label: "Tailscale binary",
    status: binExists ? "ok" : "fail",
    detail: binExists ? cfg.tailscaleBin : `Not found at ${cfg.tailscaleBin}`,
  });

  // 2. Install method
  const homebrew = binExists && isHomebrewInstall(cfg.tailscaleBin);
  checks.push({
    label: "Install method",
    status: homebrew ? "warn" : "ok",
    detail: homebrew
      ? "Homebrew — Funnel requires App Store or standalone install"
      : binExists ? "Standalone / App Store" : "N/A (binary not found)",
  });

  // 3. Version
  if (binExists) {
    const version = runSafe(cfg.tailscaleBin, ["version"]);
    checks.push({
      label: "Version",
      status: version ? "ok" : "fail",
      detail: version ?? "Could not determine version",
    });
  }

  // 4. State directory
  const stateDirExists = fs.existsSync(cfg.stateDir);
  checks.push({
    label: "State directory",
    status: stateDirExists ? "ok" : "fail",
    detail: stateDirExists ? cfg.stateDir : `Missing: ${cfg.stateDir} — tailscaled cannot create socket`,
  });

  // 5. Socket file
  const socketPath = path.join(cfg.stateDir, "tailscaled.sock");
  const socketExists = stateDirExists && fs.existsSync(socketPath);
  checks.push({
    label: "Daemon socket",
    status: socketExists ? "ok" : "fail",
    detail: socketExists ? socketPath : `Missing: ${socketPath}`,
  });

  // 6. Zombie processes
  const zombies = findZombieProcesses();
  const hasSocket = socketExists;
  if (zombies.length > 0 && !hasSocket) {
    checks.push({
      label: "Zombie processes",
      status: "fail",
      detail: `${zombies.length} tailscaled process(es) running but socket missing. PIDs: ${zombies.map((z) => z.pid).join(", ")}`,
    });
  } else if (zombies.length > 1) {
    checks.push({
      label: "Duplicate processes",
      status: "warn",
      detail: `${zombies.length} tailscaled processes found. PIDs: ${zombies.map((z) => z.pid).join(", ")}`,
    });
  } else if (zombies.length === 1 && hasSocket) {
    checks.push({
      label: "Daemon process",
      status: "ok",
      detail: `PID ${zombies[0].pid} running with valid socket`,
    });
  } else if (zombies.length === 0) {
    checks.push({
      label: "Daemon process",
      status: "warn",
      detail: "No tailscaled process running",
    });
  }

  // 7. Tailscale status (connectivity)
  if (binExists && socketExists) {
    const status = runSafe(cfg.tailscaleBin, ["status", "--json"]);
    if (status) {
      try {
        const parsed = JSON.parse(status);
        const backendState = parsed.BackendState ?? "Unknown";
        checks.push({
          label: "Connection state",
          status: backendState === "Running" ? "ok" : "warn",
          detail: backendState,
        });
      } catch {
        checks.push({ label: "Connection state", status: "warn", detail: "Could not parse status" });
      }
    } else {
      checks.push({ label: "Connection state", status: "fail", detail: "tailscale status failed" });
    }
  }

  // 8. Userspace networking
  if (zombies.length > 0) {
    const userspaceCmd = zombies.find((z) => z.cmd.includes("--tun=userspace-networking"));
    if (userspaceCmd) {
      checks.push({
        label: "Networking mode",
        status: "warn",
        detail: "Userspace networking — slower than kernel mode. Consider standalone install for better performance.",
      });
    }
  }

  // Print results
  console.log("\n🔍 mc-tailscale doctor\n");
  const icons = { ok: "✅", warn: "⚠️ ", fail: "❌" };
  for (const c of checks) {
    console.log(`  ${icons[c.status]} ${c.label}: ${c.detail}`);
  }

  const fails = checks.filter((c) => c.status === "fail");
  const warns = checks.filter((c) => c.status === "warn");
  console.log("");

  if (fails.length > 0) {
    console.log("Suggested fixes:");
    if (!stateDirExists) {
      console.log(`  mkdir -p ${cfg.stateDir}`);
    }
    if (zombies.length > 0 && !hasSocket) {
      console.log(`  # Kill zombie processes:`);
      for (const z of zombies) {
        console.log(`  kill ${z.pid}`);
      }
      console.log(`  # Then restart tailscaled:`);
      console.log(`  tailscaled --state=${cfg.stateDir}/tailscaled.state --socket=${cfg.stateDir}/tailscaled.sock &`);
    }
    if (!binExists) {
      console.log("  # Install Tailscale: https://tailscale.com/download/mac");
    }
  }

  if (fails.length === 0 && warns.length === 0) {
    console.log("All checks passed. Tailscale is healthy.");
  } else {
    console.log(`${fails.length} issue(s), ${warns.length} warning(s).`);
  }
}

// ── Status ──────────────────────────────────────────────────────────

function statusCommand(cfg: TailscaleConfig): void {
  console.log("\n📊 mc-tailscale status\n");

  // Basic status
  const statusJson = runSafe(cfg.tailscaleBin, ["status", "--json"]);
  if (!statusJson) {
    console.log("  ❌ Could not get Tailscale status. Run 'mc-tailscale doctor' first.");
    return;
  }

  let parsed: any;
  try {
    parsed = JSON.parse(statusJson);
  } catch {
    console.log("  ❌ Could not parse Tailscale status JSON.");
    return;
  }

  const self = parsed.Self;
  console.log(`  State:     ${parsed.BackendState ?? "Unknown"}`);
  console.log(`  Hostname:  ${self?.HostName ?? "Unknown"}`);
  console.log(`  DNS Name:  ${self?.DNSName ?? "Unknown"}`);
  console.log(`  Tailnet:   ${(parsed.CurrentTailnet?.Name ?? cfg.tailnetName) || "Unknown"}`);
  console.log(`  IPs:       ${(self?.TailscaleIPs ?? []).join(", ") || "None"}`);
  console.log(`  OS:        ${self?.OS ?? "Unknown"}`);
  console.log(`  Online:    ${self?.Online ?? "Unknown"}`);

  // Peer count
  const peers = parsed.Peer ?? {};
  const peerList = Object.values(peers) as any[];
  const onlinePeers = peerList.filter((p: any) => p.Online);
  console.log(`  Peers:     ${peerList.length} total, ${onlinePeers.length} online`);

  // Serve/Funnel status
  console.log("");
  const serveStatus = runSafe(cfg.tailscaleBin, ["serve", "status"]);
  if (serveStatus && serveStatus.trim()) {
    console.log("  Serve config:");
    for (const line of serveStatus.split("\n")) {
      console.log(`    ${line}`);
    }
  } else {
    console.log("  Serve:     No active serve config");
  }

  // Cert info
  console.log("");
  const dnsName = self?.DNSName?.replace(/\.$/, "");
  if (dnsName) {
    const certFile = `${dnsName}.crt`;
    if (fs.existsSync(certFile)) {
      const stat = fs.statSync(certFile);
      console.log(`  Cert:      ${certFile} (modified ${stat.mtime.toISOString().slice(0, 10)})`);
    } else {
      console.log(`  Cert:      No cert found for ${dnsName}. Run: tailscale cert ${dnsName}`);
    }
  }

  // Key expiry
  if (self?.KeyExpiry) {
    const expiry = new Date(self.KeyExpiry);
    const now = new Date();
    const daysLeft = Math.round((expiry.getTime() - now.getTime()) / 86_400_000);
    const status = daysLeft < 14 ? "⚠️ " : "✅";
    console.log(`  Key expiry: ${status} ${expiry.toISOString().slice(0, 10)} (${daysLeft} days)`);
  }
}

// ── Harden ──────────────────────────────────────────────────────────

function hardenCommand(cfg: TailscaleConfig, opts: { dryRun?: boolean }): void {
  console.log("\n🛡️  mc-tailscale harden\n");

  const dryRun = opts.dryRun ?? false;
  if (dryRun) console.log("  (dry-run mode — commands will be printed but not executed)\n");

  const actions: { label: string; cmd: string[]; reason: string }[] = [
    {
      label: "Enable shields-up (block unsolicited inbound)",
      cmd: [cfg.tailscaleBin, "set", "--shields-up=true"],
      reason: "Blocks all incoming connections unless explicitly allowed. Safe for outbound-only nodes.",
    },
    {
      label: "Disable route acceptance",
      cmd: [cfg.tailscaleBin, "set", "--accept-routes=false"],
      reason: "Prevents this node from using subnet routes advertised by other nodes.",
    },
    {
      label: "Enable auto-updates",
      cmd: [cfg.tailscaleBin, "set", "--auto-update=true"],
      reason: "Ensures security patches are applied automatically.",
    },
    {
      label: "Enable Tailscale SSH",
      cmd: [cfg.tailscaleBin, "set", "--ssh=true"],
      reason: "Uses Tailscale identity for SSH auth — more secure than password auth.",
    },
  ];

  for (const action of actions) {
    console.log(`  → ${action.label}`);
    console.log(`    Reason: ${action.reason}`);
    const cmdStr = action.cmd.join(" ");
    if (dryRun) {
      console.log(`    Command: ${cmdStr}`);
    } else {
      try {
        run(action.cmd[0], action.cmd.slice(1));
        console.log(`    ✅ Applied`);
      } catch (e) {
        console.log(`    ❌ Failed: ${e instanceof Error ? e.message : e}`);
      }
    }
    console.log("");
  }

  console.log("Additional hardening (manual steps):");
  console.log("  1. Review ACLs in Tailscale admin console — enforce deny-by-default");
  console.log("  2. Set key expiry to minimum acceptable duration (default: 180 days)");
  console.log("  3. Consider tailnet lock: tailscale lock init");
  console.log("  4. Disable password SSH: PasswordAuthentication no in /etc/ssh/sshd_config");
  console.log("  5. Enable MagicDNS HTTPS-only for DNS rebinding protection");
  console.log("  6. Enable device posture checks in admin console (if using MDM)");
}

// ── Serve ───────────────────────────────────────────────────────────

function serveCommand(cfg: TailscaleConfig, port: string, opts: { bg?: boolean; path?: string; off?: boolean }): void {
  if (opts.off) {
    console.log("Stopping Tailscale serve...");
    try {
      run(cfg.tailscaleBin, ["serve", "off"]);
      console.log("✅ Serve stopped.");
    } catch (e) {
      console.error(`❌ ${e instanceof Error ? e.message : e}`);
    }
    return;
  }

  const args = ["serve"];
  if (opts.bg) args.push("--bg");
  if (opts.path) args.push(`--set-path=${opts.path}`);
  args.push(port);

  console.log(`Starting Tailscale serve on port ${port}...`);
  try {
    const out = run(cfg.tailscaleBin, args, 30_000);
    if (out) console.log(out);
    console.log(`✅ Serving port ${port} within tailnet.`);
  } catch (e) {
    console.error(`❌ ${e instanceof Error ? e.message : e}`);
  }
}

// ── Funnel ──────────────────────────────────────────────────────────

function funnelCommand(cfg: TailscaleConfig, port: string, opts: { bg?: boolean; off?: boolean; reset?: boolean }): void {
  // Check for Homebrew install — Funnel won't work
  if (isHomebrewInstall(cfg.tailscaleBin) && !opts.off && !opts.reset) {
    console.log("⚠️  WARNING: Tailscale is installed via Homebrew.");
    console.log("   Funnel requires the App Store or standalone install.");
    console.log("   This command will likely fail.");
    console.log("   Migration: brew uninstall tailscale && download from https://tailscale.com/download/mac");
    console.log("");
  }

  if (opts.off) {
    console.log("Stopping Tailscale funnel...");
    try {
      run(cfg.tailscaleBin, ["funnel", "off"]);
      console.log("✅ Funnel stopped.");
    } catch (e) {
      console.error(`❌ ${e instanceof Error ? e.message : e}`);
    }
    return;
  }

  if (opts.reset) {
    console.log("Resetting all funnel config...");
    try {
      run(cfg.tailscaleBin, ["funnel", "reset"]);
      console.log("✅ Funnel config reset.");
    } catch (e) {
      console.error(`❌ ${e instanceof Error ? e.message : e}`);
    }
    return;
  }

  const args = ["funnel"];
  if (opts.bg) args.push("--bg");
  args.push(port);

  console.log(`Starting Tailscale funnel on port ${port}...`);
  console.log("Note: Funnel exposes this port to the PUBLIC internet (TLS only, ports 443/8443/10000).");
  try {
    const out = run(cfg.tailscaleBin, args, 30_000);
    if (out) console.log(out);
    console.log(`✅ Funneling port ${port} to the internet.`);
  } catch (e) {
    console.error(`❌ ${e instanceof Error ? e.message : e}`);
  }
}

// ── Domain ──────────────────────────────────────────────────────────

function domainCommand(cfg: TailscaleConfig, domain: string, opts: { method?: string }): void {
  console.log(`\n🌐 mc-tailscale domain — Custom domain setup for: ${domain}\n`);

  const method = opts.method ?? "reverse-proxy";

  switch (method) {
    case "reverse-proxy":
    case "a":
      console.log("Option A: Reverse Proxy (Recommended)\n");
      console.log("This is the simplest approach. A reverse proxy (Caddy recommended)");
      console.log("handles TLS for your custom domain and routes traffic via Tailscale.\n");
      console.log("Steps:");
      console.log(`  1. Point DNS for ${domain} to your proxy server's public IP`);
      console.log(`     (A record or CNAME to your proxy)`);
      console.log("  2. Install Caddy on a tailnet member with public access:");
      console.log("     brew install caddy");
      console.log(`  3. Create Caddyfile:`);
      console.log(`     ${domain} {`);
      console.log(`       reverse_proxy <tailscale-ip>:<port>`);
      console.log(`     }`);
      console.log("  4. Start Caddy: caddy run");
      console.log("     Caddy auto-provisions Let's Encrypt certs for the domain.");
      console.log("\n  Pros: Simple, auto-TLS, works with any domain");
      console.log("  Cons: Requires a publicly-accessible proxy node");
      break;

    case "split-dns":
    case "b":
      console.log("Option B: Split DNS (Tailnet-Only)\n");
      console.log("Use NextDNS or AdGuard with Tailscale for internal domain resolution.");
      console.log("Only works for devices within the tailnet.\n");
      console.log("Steps:");
      console.log("  1. Go to Tailscale Admin → DNS → Add DNS nameserver");
      console.log("  2. Add NextDNS or AdGuard Home");
      console.log(`  3. Create DNS rewrite: ${domain} → <tailscale-ip> (e.g. 100.64.0.5)`);
      console.log("  4. Enable MagicDNS in Tailscale admin");
      console.log("  5. Verify: nslookup " + domain + " (should resolve to Tailscale IP)");
      console.log("\n  Pros: No public exposure, simple setup");
      console.log("  Cons: Only works within the tailnet, no public access");
      break;

    case "delegation":
    case "c":
      console.log("Option C: DNS Delegation (Advanced)\n");
      console.log("Delegate a DNS zone to a nameserver running CoreDNS with Tailscale plugin.");
      console.log("Full control, but requires maintaining DNS infrastructure.\n");
      console.log("Steps:");
      console.log(`  1. Set up CoreDNS with the Tailscale plugin`);
      console.log(`  2. At your registrar, delegate ${domain} NS records to your CoreDNS server`);
      console.log("  3. Configure CoreDNS zones to resolve to Tailscale IPs");
      console.log("  4. Test resolution from outside the tailnet");
      console.log("\n  Pros: Full control, works for complex setups");
      console.log("  Cons: Complex, requires CoreDNS maintenance, DNS infra");
      break;

    default:
      console.log(`Unknown method: ${method}`);
      console.log("Available methods: reverse-proxy (a), split-dns (b), delegation (c)");
      return;
  }

  console.log("\n─────────────────────────────────────────");
  console.log("Run with --method to choose a different approach:");
  console.log("  mc-tailscale domain example.com --method reverse-proxy");
  console.log("  mc-tailscale domain example.com --method split-dns");
  console.log("  mc-tailscale domain example.com --method delegation");
}

// ── Register all commands ───────────────────────────────────────────

export function registerTailscaleCommands(ctx: CliContext, cfg: TailscaleConfig): void {
  const { program } = ctx;

  const ts = program
    .command("mc-tailscale")
    .description("Tailscale management — diagnostics, hardening, serve/funnel, custom domains");

  // ── mc-tailscale doctor ──
  ts.command("doctor")
    .description("Diagnose Tailscale issues: zombie processes, missing sockets, install method")
    .action(() => doctorCommand(cfg));

  // ── mc-tailscale status ──
  ts.command("status")
    .description("Show Tailscale state, services, DNS, certificates, and peer info")
    .action(() => statusCommand(cfg));

  // ── mc-tailscale harden ──
  ts.command("harden")
    .description("Interactive hardening wizard — applies security best practices")
    .option("--dry-run", "Print commands without executing them")
    .action((opts: { dryRun?: boolean }) => hardenCommand(cfg, opts));

  // ── mc-tailscale serve ──
  ts.command("serve [port]")
    .description("Share a local service within the tailnet via Tailscale Serve")
    .option("--bg", "Run in background")
    .option("--path <path>", "Mount at specific URL path")
    .option("--off", "Stop serving")
    .action((port: string | undefined, opts: { bg?: boolean; path?: string; off?: boolean }) => {
      if (!port && !opts.off) {
        // Show serve status
        const out = runSafe(cfg.tailscaleBin, ["serve", "status"]);
        console.log(out || "No active serve config.");
        return;
      }
      serveCommand(cfg, port ?? "", opts);
    });

  // ── mc-tailscale funnel ──
  ts.command("funnel [port]")
    .description("Expose a local service to the public internet via Tailscale Funnel")
    .option("--bg", "Run in background")
    .option("--off", "Stop funnel")
    .option("--reset", "Clear all funnel config")
    .action((port: string | undefined, opts: { bg?: boolean; off?: boolean; reset?: boolean }) => {
      if (!port && !opts.off && !opts.reset) {
        const out = runSafe(cfg.tailscaleBin, ["funnel", "status"]);
        console.log(out || "No active funnel config.");
        return;
      }
      funnelCommand(cfg, port ?? "", opts);
    });

  // ── mc-tailscale domain ──
  ts.command("domain <domain>")
    .description("Custom domain setup wizard — guides through reverse proxy, split DNS, or delegation")
    .option("--method <method>", "Setup method: reverse-proxy, split-dns, delegation", "reverse-proxy")
    .action((domain: string, opts: { method?: string }) => domainCommand(cfg, domain, opts));
}
