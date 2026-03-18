import * as fs from "node:fs";
import * as path from "node:path";
import { execFileSync, execSync } from "node:child_process";
import { Command } from "commander";
import type { VpnConfig } from "../index.js";

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

// ── Doctor ──────────────────────────────────────────────────────────

function doctorCommand(cfg: VpnConfig): void {
  const checks: { label: string; status: "ok" | "warn" | "fail"; detail: string }[] = [];

  // 1. Binary exists
  const binExists = fs.existsSync(cfg.mullvadBin);
  checks.push({
    label: "Mullvad binary",
    status: binExists ? "ok" : "fail",
    detail: binExists ? cfg.mullvadBin : `Not found at ${cfg.mullvadBin}`,
  });

  // 2. Version
  if (binExists) {
    const version = runSafe(cfg.mullvadBin, ["--version"]);
    checks.push({
      label: "Version",
      status: version ? "ok" : "fail",
      detail: version ?? "Could not determine version",
    });
  }

  // 3. Account status
  if (binExists) {
    const accountStatus = runSafe(cfg.mullvadBin, ["account", "get"]);
    checks.push({
      label: "Account",
      status: accountStatus ? "ok" : "fail",
      detail: accountStatus ? "Valid account" : "No account or offline",
    });
  }

  // 4. State directory
  const stateDirExists = fs.existsSync(cfg.stateDir);
  checks.push({
    label: "State directory",
    status: stateDirExists ? "ok" : "warn",
    detail: stateDirExists ? cfg.stateDir : `Missing: ${cfg.stateDir} — will be created on demand`,
  });

  // Print results
  const issues = checks.filter((c) => c.status === "fail").length;
  const warnings = checks.filter((c) => c.status === "warn").length;

  console.log("\n━━ Mullvad VPN Diagnostics ━━\n");
  checks.forEach((c) => {
    const icon = c.status === "ok" ? "✓" : c.status === "warn" ? "⚠" : "✗";
    console.log(`${icon}  ${c.label.padEnd(20)} ${c.detail}`);
  });
  console.log();

  if (issues === 0 && warnings === 0) {
    console.log("Mullvad is healthy.");
  } else {
    if (warnings > 0) console.log(`⚠  ${warnings} warning(s)`);
    if (issues > 0) console.log(`✗  ${issues} issue(s) found`);
  }
  console.log();
}

// ── Status ──────────────────────────────────────────────────────────

function statusCommand(cfg: VpnConfig): void {
  if (!fs.existsSync(cfg.mullvadBin)) {
    console.error(`Error: Mullvad binary not found at ${cfg.mullvadBin}`);
    process.exit(1);
  }

  try {
    const statusJson = run(cfg.mullvadBin, ["status", "--json"]);
    const parsed = JSON.parse(statusJson);

    console.log("\n━━ Mullvad VPN Status ━━\n");
    console.log(`State:        ${parsed.state ?? "Unknown"}`);
    console.log(`Relay:        ${parsed.relay?.hostname ?? "N/A"}`);
    console.log(`Country:      ${parsed.relay?.location?.country ?? "N/A"}`);
    console.log(`City:         ${parsed.relay?.location?.city ?? "N/A"}`);
    console.log(`IP Address:   ${parsed.tunnel_state?.in_tunnel?.ipv4 ?? "N/A"}`);
    console.log();
  } catch (e) {
    console.error(`Error: ${e instanceof Error ? e.message : String(e)}`);
    process.exit(1);
  }
}

// ── Connect ──────────────────────────────────────────────────────────

function connectCommand(cfg: VpnConfig, country?: string): void {
  if (!fs.existsSync(cfg.mullvadBin)) {
    console.error(`Error: Mullvad binary not found at ${cfg.mullvadBin}`);
    process.exit(1);
  }

  try {
    if (country) {
      console.log(`Setting relay location to: ${country}`);
      run(cfg.mullvadBin, ["relay", "set", "location", country]);
    }
    console.log("Connecting to Mullvad VPN...");
    run(cfg.mullvadBin, ["connect"]);
    console.log("Connected!");
  } catch (e) {
    console.error(`Error: ${e instanceof Error ? e.message : String(e)}`);
    process.exit(1);
  }
}

// ── Disconnect ──────────────────────────────────────────────────────

function disconnectCommand(cfg: VpnConfig): void {
  if (!fs.existsSync(cfg.mullvadBin)) {
    console.error(`Error: Mullvad binary not found at ${cfg.mullvadBin}`);
    process.exit(1);
  }

  try {
    console.log("Disconnecting from Mullvad VPN...");
    run(cfg.mullvadBin, ["disconnect"]);
    console.log("Disconnected!");
  } catch (e) {
    console.error(`Error: ${e instanceof Error ? e.message : String(e)}`);
    process.exit(1);
  }
}

// ── Countries ──────────────────────────────────────────────────────────

function countriesCommand(cfg: VpnConfig): void {
  if (!fs.existsSync(cfg.mullvadBin)) {
    console.error(`Error: Mullvad binary not found at ${cfg.mullvadBin}`);
    process.exit(1);
  }

  try {
    const relayList = run(cfg.mullvadBin, ["relay", "list"]);
    console.log("\n━━ Available Relay Countries ━━\n");
    console.log(relayList);
    console.log();
  } catch (e) {
    console.error(`Error: ${e instanceof Error ? e.message : String(e)}`);
    process.exit(1);
  }
}

// ── Command Registration ────────────────────────────────────────────

export function registerVpnCommands(ctx: CliContext, cfg: VpnConfig): void {
  const { program } = ctx;

  const vpn = program
    .command("mc-vpn")
    .description("Mullvad VPN management — connect, disconnect, country switching");

  vpn
    .command("status")
    .description("Show current VPN connection state, relay location, and IP address")
    .action(() => statusCommand(cfg));

  vpn
    .command("connect")
    .description("Connect to VPN")
    .option("--country <code>", "Country code for relay location")
    .action((opts: any) => connectCommand(cfg, opts.country));

  vpn
    .command("disconnect")
    .description("Disconnect from VPN")
    .action(() => disconnectCommand(cfg));

  vpn
    .command("countries")
    .description("List available relay countries")
    .action(() => countriesCommand(cfg));

  vpn
    .command("doctor")
    .description("Diagnose Mullvad VPN issues: binary, daemon, account status")
    .action(() => doctorCommand(cfg));
}
