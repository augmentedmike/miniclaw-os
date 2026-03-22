import { spawnSync } from "node:child_process";
import { findBin } from "./constants";

/**
 * Install and start the openclaw gateway LaunchAgent.
 * Returns { ok, error? } — errors are non-fatal (gateway can be started manually).
 */
export function ensureGatewayRunning(): { ok: boolean; error?: string } {
  const ocBin = findBin("openclaw");
  if (!ocBin) return { ok: false, error: "openclaw not found on PATH" };

  // DO NOT run openclaw doctor --fix here — it rewrites openclaw.json
  // and wipes the miniclaw plugin paths/entries that install.sh configured.

  // Install the gateway LaunchAgent (creates plist + loads it)
  const installResult = spawnSync(ocBin, ["gateway", "install", "--force"], {
    encoding: "utf-8",
    timeout: 30_000,
  });
  if (installResult.status !== 0) {
    return { ok: false, error: installResult.stderr?.trim() || "gateway install failed" };
  }

  // Give it a moment to start
  spawnSync("sleep", ["3"]);

  // Check status
  const statusResult = spawnSync(ocBin, ["gateway", "status"], {
    encoding: "utf-8",
    timeout: 10_000,
  });
  const output = (statusResult.stdout || "") + (statusResult.stderr || "");
  const running = /running|listening|connected|uptime/i.test(output);

  return running
    ? { ok: true }
    : { ok: false, error: "gateway installed but not yet running — it may need a few more seconds" };
}
