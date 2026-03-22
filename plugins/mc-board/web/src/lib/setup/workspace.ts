import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { execSync } from "node:child_process";
import { readSetupState } from "@/lib/setup-state";
import { STATE_DIR } from "./constants";

/**
 * Create the canonical projects folder and ~/mc-projects symlink.
 * Path: ~/.openclaw/miniclaw/USER/projects (safe from updates)
 * Symlink: ~/mc-projects -> the above path
 */
export function ensureProjectsFolder(): { ok: boolean; path: string; symlink: string } {
  const projectsDir = path.join(STATE_DIR, "miniclaw", "USER", "projects");
  const symlinkPath = path.join(os.homedir(), "mc-projects");

  fs.mkdirSync(projectsDir, { recursive: true });

  // Create symlink if it doesn't already point to the right place
  try {
    const existing = fs.readlinkSync(symlinkPath);
    if (existing !== projectsDir) {
      fs.unlinkSync(symlinkPath);
      fs.symlinkSync(projectsDir, symlinkPath);
    }
  } catch {
    // symlink doesn't exist or isn't a symlink — create it
    try { fs.unlinkSync(symlinkPath); } catch { /* ignore */ }
    fs.symlinkSync(projectsDir, symlinkPath);
  }

  return { ok: true, path: projectsDir, symlink: symlinkPath };
}

/**
 * Re-run the workspace personalization from install.sh.
 * Replaces {{AGENT_NAME}}, {{PRONOUNS}}, etc. in all workspace .md files.
 */
export function personalizeWorkspace() {
  const setupState = readSetupState();
  const name = setupState.assistantName;
  if (!name) return;

  const workspace = path.join(STATE_DIR, "workspace");
  const manifestPath = path.join(STATE_DIR, "miniclaw", "MANIFEST.json");

  if (!fs.existsSync(workspace)) return;

  const script = `
import json, sys, os
from datetime import date

workspace = sys.argv[1]
manifest_path = sys.argv[2]
state = json.loads(sys.argv[3])

name = state.get("assistantName", "")
short = state.get("shortName", name)
pronouns = state.get("pronouns", "they/them")
blurb = state.get("personaBlurb", "")
email = state.get("emailAddress", "")
gh_user = state.get("ghUsername", "")

if not name:
    sys.exit(0)

pmap = {"she/her": ("she", "her"), "he/him": ("he", "his"), "they/them": ("they", "their")}
subj, poss = pmap.get(pronouns, ("they", "their"))

version = "0.1.0"
try:
    with open(manifest_path) as f:
        version = json.load(f).get("version", version)
except Exception:
    pass

today = date.today().isoformat()
replacements = {
    "{{AGENT_NAME}}": name, "{{AGENT_SHORT}}": short,
    "{{HUMAN_NAME}}": "my human", "{{PRONOUNS}}": pronouns,
    "{{PRONOUNS_SUBJECT}}": subj, "{{PRONOUNS_POSSESSIVE}}": poss,
    "{{VERSION}}": version, "{{DATE}}": today,
    "{{EMAIL}}": email, "{{GITHUB}}": gh_user,
}

for dirpath, _dirs, files in os.walk(workspace):
    for fname in files:
        if not fname.endswith(".md"):
            continue
        fpath = os.path.join(dirpath, fname)
        with open(fpath) as f:
            content = f.read()
        changed = False
        for placeholder, value in replacements.items():
            if placeholder in content:
                content = content.replace(placeholder, value)
                changed = True
        if changed:
            with open(fpath, "w") as f:
                f.write(content)

print(f"Personalized: {name} ({pronouns})")
`;

  try {
    const stateJson = JSON.stringify(setupState);
    const tmpScript = path.join(os.tmpdir(), `miniclaw-personalize-${process.pid}.py`);
    fs.writeFileSync(tmpScript, script, "utf-8");
    execSync(`python3 "${tmpScript}" "${workspace}" "${manifestPath}" '${stateJson.replace(/'/g, "'\\''")}'`, {
      encoding: "utf-8",
      timeout: 15_000,
    });
    fs.unlinkSync(tmpScript);
  } catch (e) {
    console.error("Workspace personalization failed:", e);
  }
}
