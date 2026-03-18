/**
 * macos-vnc.ts — ensure macOS VNC (Screen Sharing) is reachable
 *
 * On macOS, VNC runs via the built-in Apple Remote Desktop / Screen Sharing.
 * This module:
 *   1. Checks if port is reachable (fast TCP probe)
 *   2. If not, tries to enable it via `kickstart` (requires sudo — may fail silently)
 *   3. Returns true if VNC is connectable
 */

import * as net from "node:net";
import * as child_process from "node:child_process";

type Logger = { info(m: string): void; warn(m: string): void; error(m: string): void };

/** Probe whether the VNC port accepts TCP connections. */
function probeVnc(host: string, port: number, timeoutMs = 2000): Promise<boolean> {
  return new Promise((resolve) => {
    const sock = net.createConnection({ host, port });
    const timer = setTimeout(() => { sock.destroy(); resolve(false); }, timeoutMs);
    sock.on("connect", () => { clearTimeout(timer); sock.destroy(); resolve(true); });
    sock.on("error", () => { clearTimeout(timer); resolve(false); });
  });
}

/** Try to enable macOS Screen Sharing via ARD kickstart (best-effort, needs sudo). */
function tryEnableScreenSharing(logger: Logger): Promise<boolean> {
  return new Promise((resolve) => {
    const kickstart = "/System/Library/CoreServices/RemoteManagement/ARDAgent.app/Contents/Resources/kickstart";
    const proc = child_process.spawn("sudo", [
      kickstart,
      "-activate",
      "-configure", "-access", "-on",
      "-configure", "-allowAccessFor", "-allUsers",
      "-configure", "-restart", "-agent",
      "-privs", "-all",
    ], { stdio: "ignore" });

    proc.on("error", (err) => {
      logger.warn(`mc-human: kickstart spawn failed: ${err.message}`);
      resolve(false);
    });

    proc.on("close", (code) => {
      if (code === 0) {
        logger.info("mc-human: kickstart activated Screen Sharing");
        resolve(true);
      } else {
        logger.warn(`mc-human: kickstart exited ${code} (may need sudo or System Preferences)`);
        resolve(false);
      }
    });

    // If sudo prompts for a password in a non-interactive session, kill after 3s
    setTimeout(() => { proc.kill(); resolve(false); }, 3000);
  });
}

/**
 * Ensure VNC is reachable. Returns true if the port is connectable.
 * Tries kickstart activation if not initially reachable.
 */
export async function enableMacOsVnc(
  host: string,
  port: number,
  logger: Logger
): Promise<boolean> {
  logger.info(`mc-human: checking VNC at ${host}:${port}`);

  if (await probeVnc(host, port)) {
    logger.info(`mc-human: VNC reachable at ${host}:${port}`);
    return true;
  }

  logger.info("mc-human: VNC not reachable — attempting kickstart activation");
  await tryEnableScreenSharing(logger);

  // Wait a moment for the service to start
  await new Promise((r) => setTimeout(r, 1500));

  const reachable = await probeVnc(host, port, 3000);
  if (reachable) {
    logger.info(`mc-human: VNC now reachable after activation`);
  } else {
    logger.warn(`mc-human: VNC still not reachable after activation attempt`);
  }
  return reachable;
}
