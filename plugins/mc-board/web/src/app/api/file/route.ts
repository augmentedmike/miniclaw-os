import { NextRequest, NextResponse } from "next/server";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { execSync } from "node:child_process";

const IMAGE_EXTS = new Set([".png", ".jpg", ".jpeg", ".gif", ".svg", ".webp", ".ico"]);
const IMAGE_MIME: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
};

const EXT_TO_LANG: Record<string, string> = {
  ".ts": "typescript", ".tsx": "typescript", ".js": "javascript", ".jsx": "javascript",
  ".mjs": "javascript", ".cjs": "javascript", ".json": "json", ".md": "markdown",
  ".sh": "bash", ".bash": "bash", ".zsh": "bash", ".py": "python", ".rb": "ruby",
  ".go": "go", ".rs": "rust", ".java": "java", ".kt": "kotlin", ".swift": "swift",
  ".c": "c", ".cpp": "cpp", ".h": "c", ".hpp": "cpp", ".cs": "csharp",
  ".css": "css", ".html": "html", ".xml": "xml", ".yaml": "yaml", ".yml": "yaml",
  ".toml": "toml", ".sql": "sql", ".txt": "plaintext", ".lock": "plaintext",
  ".env": "bash", ".gitignore": "plaintext",
};

const AM_HOME = process.env.MINICLAW_STATE_DIR ?? process.env.OPENCLAW_STATE_DIR ?? path.join(os.homedir(), "am");

function expandTilde(p: string): string {
  return p.startsWith("~/") ? path.join(os.homedir(), p.slice(2)) : p;
}

function resolvePath(filePath: string, base?: string): string {
  const fp = expandTilde(filePath);
  if (path.isAbsolute(fp)) return fp;
  const expandedBase = base ? expandTilde(base) : undefined;
  if (expandedBase) return path.resolve(expandedBase, fp);
  return path.resolve(fp);
}

// Fallback: search for the file by path suffix, pruning node_modules/.next/.git
function findInRoot(root: string, relativePath: string): string | null {
  // Use -prune to avoid descending into heavy dirs — keeps find fast (<200ms)
  const pluginsDir = path.join(AM_HOME, "miniclaw", "plugins");
  const projectsDir = path.join(AM_HOME, "projects");
  const searchRoots = [pluginsDir, projectsDir, root]
    .filter((r, i, arr) => arr.indexOf(r) === i && fs.existsSync(r))
    .map(r => `"${r}"`)
    .join(" ");
  try {
    const out = execSync(
      `find ${searchRoots} \\( -name node_modules -o -name .next -o -name .git -o -name dist \\) -prune -o -path "*/${relativePath}" -print 2>/dev/null | head -1`,
      { encoding: "utf-8", timeout: 10000, shell: "/bin/zsh" }
    ).trim();
    return out || null;
  } catch {
    return null;
  }
}

export async function GET(req: NextRequest) {
  const filePath = req.nextUrl.searchParams.get("path");
  const base = req.nextUrl.searchParams.get("base") ?? undefined;

  if (!filePath) {
    return NextResponse.json({ error: "No path provided" }, { status: 400 });
  }

  let resolved = resolvePath(filePath, base);
  const isRelative = !filePath.startsWith("~/") && !path.isAbsolute(filePath);

  // If not found and path is relative, search in base dir or ~/am
  if (!fs.existsSync(resolved) && isRelative) {
    const searchRoot = base ? expandTilde(base) : AM_HOME;
    const found = findInRoot(searchRoot, filePath);
    if (found) resolved = found;
  }

  const ext = path.extname(resolved).toLowerCase();

  try {
    if (!fs.existsSync(resolved)) {
      return NextResponse.json({ error: "File not found", resolved }, { status: 404 });
    }
    const stat = fs.statSync(resolved);
    if (!stat.isFile()) {
      return NextResponse.json({ error: "Not a file", resolved }, { status: 400 });
    }
    if (stat.size > 2 * 1024 * 1024) {
      return NextResponse.json({ error: "File too large (>2MB)", resolved }, { status: 400 });
    }

    if (IMAGE_EXTS.has(ext)) {
      const buf = fs.readFileSync(resolved);
      return new NextResponse(buf, {
        headers: { "Content-Type": IMAGE_MIME[ext] ?? "application/octet-stream" },
      });
    }

    const content = fs.readFileSync(resolved, "utf-8");
    return NextResponse.json({
      content,
      resolved,
      ext,
      lang: EXT_TO_LANG[ext] ?? "plaintext",
      size: stat.size,
    });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
