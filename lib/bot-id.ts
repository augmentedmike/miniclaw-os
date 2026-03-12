import * as path from "node:path";
import * as os from "node:os";

/**
 * Resolve the USER base directory.
 */
export function resolveUserDir(): string {
  const stateDir = process.env.OPENCLAW_STATE_DIR ?? path.join(os.homedir(), ".openclaw");
  return path.join(stateDir, "USER");
}
