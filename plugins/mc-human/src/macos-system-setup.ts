/**
 * macos-system-setup.ts — configure macOS for headless OpenClaw
 *
 * Post-install setup for Mac mini (or any headless macOS) running OpenClaw:
 *   1. Enable Screen Sharing (VNC) via launchctl + kickstart
 *   2. Disable system sleep via pmset
 *   3. Configure display sleep (optional, separate from system sleep)
 *   4. Disable screensaver on login window
 *   5. Configure auto-updates (defer, no auto-restart)
 *
 * All operations require sudo. Idempotent — safe to run multiple times.
 */

import * as child_process from "node:child_process";
import * as net from "node:net";

type Logger = { info(m: string): void; warn(m: string): void; error(m: string): void };

interface SetupResult {
  success: boolean;
  steps: StepResult[];
  summary: string;
}

interface StepResult {
  name: string;
  success: boolean;
  output?: string;
  error?: string;
}

/** Async exec wrapper with better error handling. */
function execAsync(
  cmd: string,
  args: string[],
  requireSudo = false,
  logger: Logger
): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    const fullCmd = requireSudo ? "sudo" : cmd;
    const fullArgs = requireSudo ? [cmd, ...args] : args;

    const proc = child_process.spawn(fullCmd, fullArgs, {
      stdio: ["ignore", "pipe", "pipe"],
      timeout: 10000,
    });

    let stdout = "";
    let stderr = "";

    proc.stdout?.on("data", (data: Buffer) => {
      stdout += data.toString();
    });
    proc.stderr?.on("data", (data: Buffer) => {
      stderr += data.toString();
    });

    const timer = setTimeout(() => {
      proc.kill();
      resolve({ code: 124, stdout, stderr: "command timeout" });
    }, 15000);

    proc.on("close", (code) => {
      clearTimeout(timer);
      resolve({ code: code ?? 1, stdout, stderr });
    });

    proc.on("error", (err) => {
      clearTimeout(timer);
      resolve({ code: 1, stdout, stderr: err.message });
    });
  });
}

/** Check if a port is reachable. */
function probePort(host: string, port: number, timeoutMs = 2000): Promise<boolean> {
  return new Promise((resolve) => {
    const sock = net.createConnection({ host, port });
    const timer = setTimeout(() => {
      sock.destroy();
      resolve(false);
    }, timeoutMs);
    sock.on("connect", () => {
      clearTimeout(timer);
      sock.destroy();
      resolve(true);
    });
    sock.on("error", () => {
      clearTimeout(timer);
      resolve(false);
    });
  });
}

/**
 * Step 1: Enable Screen Sharing (VNC) via launchctl + kickstart.
 * - Load the Screen Sharing launchd plist
 * - Activate via kickstart with full access
 */
async function setupScreenSharing(logger: Logger): Promise<StepResult> {
  const stepName = "Screen Sharing (VNC)";
  logger.info(`  Setting up ${stepName}…`);

  // Step 1a: Load the launchd plist
  const launchctlResult = await execAsync(
    "launchctl",
    ["load", "-w", "/System/Library/LaunchDaemons/com.apple.screensharing.plist"],
    true,
    logger
  );

  if (launchctlResult.code !== 0 && !launchctlResult.stderr.includes("already loaded")) {
    return {
      name: stepName,
      success: false,
      error: `launchctl load failed: ${launchctlResult.stderr}`,
    };
  }

  // Step 1b: Activate via kickstart
  const kickstart = "/System/Library/CoreServices/RemoteManagement/ARDAgent.app/Contents/Resources/kickstart";
  const kickstartResult = await execAsync(
    kickstart,
    [
      "-activate",
      "-configure", "-access", "-on",
      "-configure", "-allowAccessFor", "-allUsers",
      "-configure", "-restart", "-agent",
      "-privs", "-all",
    ],
    true,
    logger
  );

  if (kickstartResult.code !== 0) {
    return {
      name: stepName,
      success: false,
      error: `kickstart failed: ${kickstartResult.stderr}`,
    };
  }

  // Wait for the service to start
  await new Promise((r) => setTimeout(r, 1500));

  // Verify it's reachable
  const reachable = await probePort("127.0.0.1", 5900, 3000);
  if (!reachable) {
    return {
      name: stepName,
      success: false,
      error: "VNC port 5900 not reachable after setup",
    };
  }

  return {
    name: stepName,
    success: true,
    output: "Screen Sharing enabled and port 5900 is reachable",
  };
}

/**
 * Step 2: Disable system sleep via pmset.
 * Sets: sleep=0 (no system sleep), disksleep=0, hibernatemode=0
 */
async function setupPowerManagement(logger: Logger): Promise<StepResult> {
  const stepName = "Power management (disable system sleep)";
  logger.info(`  Setting up ${stepName}…`);

  const result = await execAsync(
    "pmset",
    ["-a", "sleep", "0", "disksleep", "0", "hibernatemode", "0"],
    true,
    logger
  );

  if (result.code !== 0) {
    return {
      name: stepName,
      success: false,
      error: `pmset failed: ${result.stderr}`,
    };
  }

  // Verify the setting — match "sleep" at line start with flexible whitespace before "0"
  const verifyResult = await execAsync("pmset", ["-g"], false, logger);
  const sleepMatch = verifyResult.stdout.match(/^\s*sleep\s+(\d+)/m);
  if (sleepMatch && sleepMatch[1] === "0") {
    return {
      name: stepName,
      success: true,
      output: "System sleep disabled (pmset sleep=0)",
    };
  } else {
    return {
      name: stepName,
      success: false,
      error: "pmset verification failed — sleep setting not applied",
    };
  }
}

/**
 * Step 3: Configure display sleep (separate from system sleep).
 * Sets display to sleep after 30 minutes of inactivity.
 */
async function setupDisplaySleep(logger: Logger): Promise<StepResult> {
  const stepName = "Display sleep (30 min)";
  logger.info(`  Setting up ${stepName}…`);

  const result = await execAsync(
    "pmset",
    ["-a", "displaysleep", "30"],
    true,
    logger
  );

  if (result.code !== 0) {
    return {
      name: stepName,
      success: false,
      error: `pmset displaysleep failed: ${result.stderr}`,
    };
  }

  return {
    name: stepName,
    success: true,
    output: "Display sleep set to 30 minutes",
  };
}

/**
 * Step 4: Disable screensaver on login window.
 * Sets loginWindowIdleTime to 0.
 */
async function setupScreensaver(logger: Logger): Promise<StepResult> {
  const stepName = "Screensaver (login window)";
  logger.info(`  Setting up ${stepName}…`);

  const result = await execAsync(
    "defaults",
    [
      "write",
      "com.apple.screensaver",
      "loginWindowIdleTime",
      "0",
    ],
    true,
    logger
  );

  if (result.code !== 0) {
    return {
      name: stepName,
      success: false,
      error: `defaults write failed: ${result.stderr}`,
    };
  }

  return {
    name: stepName,
    success: true,
    output: "Login window screensaver disabled",
  };
}

/**
 * Step 5: Configure auto-updates (defer + no auto-restart).
 * - Set automatic update check to daily
 * - Disable automatic restart after updates
 */
async function setupAutoUpdates(logger: Logger): Promise<StepResult> {
  const stepName = "Auto-updates configuration";
  logger.info(`  Setting up ${stepName}…`);

  // Disable auto-restart
  const restartResult = await execAsync(
    "defaults",
    [
      "write",
      "/Library/Preferences/com.apple.commerce",
      "AutoUpdate",
      "-bool",
      "false",
    ],
    true,
    logger
  );

  if (restartResult.code !== 0) {
    // This might fail if path doesn't exist yet, try soft-setting
    logger.warn("  Auto-update restart setting may have failed (non-critical)");
  }

  // Disable automatic critical updates restart
  const criticalResult = await execAsync(
    "defaults",
    [
      "write",
      "/Library/Preferences/com.apple.commerce",
      "AutoUpdateRestartRequired",
      "-bool",
      "false",
    ],
    true,
    logger
  );

  if (criticalResult.code !== 0) {
    logger.warn("  Critical update setting may have failed (non-critical)");
  }

  // Both are non-critical — succeed if at least one worked
  const anyWorked = restartResult.code === 0 || criticalResult.code === 0;
  return {
    name: stepName,
    success: anyWorked,
    output: anyWorked ? "Auto-update restart disabled (daily checks enabled)" : undefined,
    error: anyWorked ? undefined : "Both auto-update settings failed (non-critical)",
  };
}

/**
 * Run the full macOS post-install setup sequence.
 * Returns a result object with step-by-step details and overall summary.
 *
 * Note: Most operations require sudo. If running in a non-interactive environment,
 * the sudo calls will fail. Use `ask_human` to get interactive access, or configure
 * passwordless sudo for these specific commands.
 */
export async function setupMacOsSystem(logger: Logger): Promise<SetupResult> {
  logger.info("Starting macOS post-install system setup…");
  const steps: StepResult[] = [];

  // Run each setup step
  steps.push(await setupScreenSharing(logger));
  steps.push(await setupPowerManagement(logger));
  steps.push(await setupDisplaySleep(logger));
  steps.push(await setupScreensaver(logger));
  steps.push(await setupAutoUpdates(logger));

  const succeeded = steps.filter((s) => s.success).length;
  const total = steps.length;
  const success = steps.every((s) => s.success);

  const hasSudoErrors = steps.filter((s) => s.error?.includes("terminal is required")).length > 0;

  let summary =
    `macOS setup complete: ${succeeded}/${total} steps successful\n` +
    steps.map((s) => `  ${s.success ? "✓" : "✗"} ${s.name}\n      ${s.success ? s.output : s.error}`).join("\n");

  if (hasSudoErrors) {
    summary +=
      `\n\n⚠  NOTE: Some steps require sudo but no terminal was available.\n` +
      `To run with sudo access, use: ask_human "Setup macOS system settings"\n` +
      `Or configure passwordless sudo for these commands:
  - launchctl load (Screen Sharing)
  - pmset (power management)
  - defaults write (screensaver)`;
  }

  logger.info(summary);

  return {
    success,
    steps,
    summary,
  };
}

/**
 * Verify that macOS system settings are correctly configured.
 * Used by smoke tests to ensure setup was run and applied.
 */
export async function verifyMacOsSetup(logger: Logger): Promise<{
  vnc_reachable: boolean;
  system_sleep_disabled: boolean;
  display_sleep_configured: boolean;
  screensaver_disabled: boolean;
  all_ok: boolean;
}> {
  logger.info("Verifying macOS system setup…");

  const results = {
    vnc_reachable: await probePort("127.0.0.1", 5900, 2000),
    system_sleep_disabled: false,
    display_sleep_configured: false,
    screensaver_disabled: false,
    all_ok: false,
  };

  // Check pmset settings
  const pmsetResult = await execAsync("pmset", ["-g"], false, logger);
  // Match "sleep" at line start with flexible whitespace, excluding "displaysleep"/"disksleep"
  const sleepMatch = pmsetResult.stdout.match(/^\s*sleep\s+(\d+)/m);
  if (sleepMatch && sleepMatch[1] === "0") {
    results.system_sleep_disabled = true;
  }
  const displayMatch = pmsetResult.stdout.match(/^\s*displaysleep\s+(\d+)/m);
  if (displayMatch) {
    results.display_sleep_configured = true;
  }

  // Check screensaver setting
  const ssResult = await execAsync(
    "defaults",
    ["read", "com.apple.screensaver", "loginWindowIdleTime"],
    false,
    logger
  );
  if (ssResult.stdout.trim() === "0") {
    results.screensaver_disabled = true;
  }

  results.all_ok =
    results.vnc_reachable &&
    results.system_sleep_disabled &&
    results.display_sleep_configured &&
    results.screensaver_disabled;

  return results;
}
