import { execFileSync, execFile } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { promisify } from "node:util";
import type { CalendarConfig } from "./config.js";

const execFileAsync = promisify(execFile);

export function ensureHelper(cfg: CalendarConfig): void {
  const swiftSrc = path.join(cfg.pluginDir, "calendar-helper.swift");
  const infoPlist = path.join(cfg.pluginDir, "Info.plist");
  const appBundle = path.join(cfg.pluginDir, "calendar-helper.app");
  const binDir = path.join(appBundle, "Contents", "MacOS");
  const bin = cfg.helperBin;

  const needsCompile =
    !fs.existsSync(bin) ||
    fs.statSync(swiftSrc).mtimeMs > fs.statSync(bin).mtimeMs ||
    fs.statSync(infoPlist).mtimeMs > fs.statSync(bin).mtimeMs;

  if (!needsCompile) return;

  fs.mkdirSync(binDir, { recursive: true });
  execFileSync("swiftc", ["-O", swiftSrc, "-o", bin], {
    encoding: "utf-8",
    timeout: 60_000,
  });
  fs.copyFileSync(infoPlist, path.join(appBundle, "Contents", "Info.plist"));
  execFileSync("codesign", [
    "-s", "-", "--identifier", "com.miniclaw.calendar-helper",
    "--force", appBundle,
  ], {
    encoding: "utf-8",
    timeout: 10_000,
  });
}

export async function calHelper(
  cfg: CalendarConfig,
  operation: string,
  params: Record<string, unknown> = {},
): Promise<{ result?: any; error?: string }> {
  ensureHelper(cfg);

  const payload = JSON.stringify(params);
  const appBundle = path.join(cfg.pluginDir, "calendar-helper.app");

  // Try launching as .app first (gets proper EventKit permissions),
  // fall back to direct binary execution
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "mc-calendar-"));
  const outputFile = path.join(tmpDir, "result.json");

  try {
    try {
      await execFileAsync("open", ["-W", "-n", appBundle, "--args", operation, payload, outputFile], {
        encoding: "utf-8",
        timeout: 30_000,
      });
    } catch {
      // App launch failed — try direct binary
      const { stdout } = await execFileAsync(cfg.helperBin, [operation, payload], {
        encoding: "utf-8",
        maxBuffer: 10 * 1024 * 1024,
      });
      return JSON.parse(stdout.trim());
    }

    if (!fs.existsSync(outputFile)) {
      throw new Error("Calendar helper did not return a result file");
    }
    const output = fs.readFileSync(outputFile, "utf-8").trim();
    if (!output) throw new Error("Calendar helper returned empty output");
    return JSON.parse(output);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

export function calHelperSync(
  cfg: CalendarConfig,
  operation: string,
  params: Record<string, unknown> = {},
): { result?: any; error?: string } {
  ensureHelper(cfg);
  const payload = JSON.stringify(params);
  const stdout = execFileSync(cfg.helperBin, [operation, payload], {
    encoding: "utf-8",
    maxBuffer: 10 * 1024 * 1024,
    timeout: 30_000,
  });
  return JSON.parse(stdout.trim());
}
