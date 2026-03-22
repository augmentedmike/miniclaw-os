import { NextResponse } from "next/server";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { stateDir, pluginsDir as getPluginsDir } from "@/lib/paths";

export const dynamic = "force-dynamic";

interface ManifestPlugin {
  id: string;
  label: string;
  description: string;
  path: string;
  entry?: string;
  cli?: boolean;
  tools?: string[];
  web?: { port: number; standalone?: string };
  config?: Record<string, unknown>;
  optional?: boolean;
  requires?: string[];
}

interface Manifest {
  plugins: ManifestPlugin[];
}

function findManifest(): string | null {
  const candidates = [
    path.join(stateDir(), "projects", "miniclaw-os", "MANIFEST.json"),
  ];
  if (process.env.MINICLAW_OS_DIR) {
    candidates.unshift(path.join(process.env.MINICLAW_OS_DIR, "MANIFEST.json"));
  }
  // Walk up from CWD
  let dir = process.cwd();
  for (let i = 0; i < 10; i++) {
    const candidate = path.join(dir, "MANIFEST.json");
    if (fs.existsSync(candidate)) {
      candidates.unshift(candidate);
      break;
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }
  return null;
}

function getInstalledPlugins(): Set<string> {
  const pDir = getPluginsDir();
  const installed = new Set<string>();
  try {
    const entries = fs.readdirSync(pDir, { withFileTypes: true });
    for (const e of entries) {
      if (e.isDirectory()) installed.add(e.name);
    }
  } catch { /* plugins dir may not exist */ }
  return installed;
}

export function GET() {
  const manifestPath = findManifest();
  if (!manifestPath) {
    return NextResponse.json({ ok: false, error: "MANIFEST.json not found" }, { status: 404 });
  }

  let manifest: Manifest;
  try {
    manifest = JSON.parse(fs.readFileSync(manifestPath, "utf-8"));
  } catch { /* malformed MANIFEST.json */
    return NextResponse.json({ ok: false, error: "Failed to parse MANIFEST.json" }, { status: 500 });
  }

  const installed = getInstalledPlugins();

  const agents = manifest.plugins.map((p) => ({
    id: p.id,
    label: p.label,
    description: p.description,
    optional: p.optional ?? false,
    installed: installed.has(p.id),
    hasWeb: !!p.web,
    hasCli: !!p.cli,
    toolCount: p.tools?.length ?? 0,
    requires: p.requires ?? [],
  }));

  return NextResponse.json({ ok: true, agents, total: agents.length });
}
