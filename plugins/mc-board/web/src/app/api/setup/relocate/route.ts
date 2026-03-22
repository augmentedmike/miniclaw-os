export const dynamic = "force-dynamic";

import { readSetupState } from "@/lib/setup-state";
import { execSync } from "node:child_process";
import * as path from "node:path";
import * as fs from "node:fs";
import * as os from "node:os";
import { apiOk, apiError } from "@/lib/api-response";
import { stateDir } from "@/lib/paths";

const STATE_DIR = stateDir();

function findRelocateScript(): string {
  const candidates = [
    path.join(STATE_DIR, "miniclaw", "scripts", "relocate-home.sh"),
    path.join(STATE_DIR, "projects", "miniclaw-os", "scripts", "relocate-home.sh"),
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }
  throw new Error("relocate-home.sh not found");
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const force = body.force === true;

  const setupState = readSetupState();
  const nickname = (setupState.shortName || "am").toLowerCase().replace(/[^a-z0-9_-]/g, "");

  if (!nickname) {
    return apiError("No nickname to derive from shortName");
  }

  // Skip if already relocated
  if (STATE_DIR !== path.join(os.homedir(), ".openclaw")) {
    return apiOk({ skipped: true, stateDir: STATE_DIR });
  }

  const script = findRelocateScript();
  const args = force ? `${nickname} --force` : nickname;

  try {
    const output = execSync(`bash "${script}" ${args}`, {
      encoding: "utf-8",
      env: { ...process.env, OPENCLAW_STATE_DIR: STATE_DIR },
      timeout: 30_000,
    });

    // Parse the new STATE_DIR from output
    const match = output.match(/OPENCLAW_STATE_DIR=(.+)/);
    const newStateDir = match ? match[1].trim() : path.join(os.homedir(), nickname);

    // Extract any warnings from the output
    const warnings = (output.match(/WARNING: .+/g) || []).map((w: string) => w.replace("WARNING: ", ""));

    return apiOk({ newStateDir, warnings, output });
  } catch (err: unknown) {
    const execErr = err as { status?: number; stdout?: string; stderr?: string };

    // Exit code 2 = conflict, needs user confirmation
    if (execErr.status === 2) {
      const conflictMatch = (execErr.stdout || "").match(/CONFLICT_PATH=(.+)/);
      const conflictPath = conflictMatch ? conflictMatch[1].trim() : path.join(os.homedir(), nickname);
      return apiError(`~/${nickname} already exists. It will be backed up and overwritten. conflictPath=${conflictPath}`, 409);
    }

    return apiError((execErr.stderr || execErr.stdout || "relocate failed").toString().slice(0, 500), 500);
  }
}
