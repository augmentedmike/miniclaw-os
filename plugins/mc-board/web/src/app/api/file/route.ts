import { NextRequest, NextResponse } from "next/server";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";

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

const AM_HOME = process.env.OPENCLAW_STATE_DIR ?? path.join(os.homedir(), "am");

/** Allowed root directories for file access. */
const ALLOWED_ROOTS = [
  path.join(AM_HOME, "miniclaw", "plugins"),
  path.join(AM_HOME, "projects"),
  AM_HOME,
];

function expandTilde(p: string): string {
  return p.startsWith("~/") ? path.join(os.homedir(), p.slice(2)) : p;
}

/**
 * Validate that a resolved path is within allowed roots.
 * Prevents path traversal attacks (../, absolute paths to sensitive dirs).
 */
function isPathAllowed(resolved: string): boolean {
  try {
    const real = fs.realpathSync(resolved);
    return ALLOWED_ROOTS.some(root => {
      try {
        const realRoot = fs.realpathSync(root);
        return real.startsWith(realRoot + path.sep) || real === realRoot;
      } catch {
        return false;
      }
    });
  } catch {
    // File doesn't exist yet — validate the directory
    const dir = path.dirname(resolved);
    try {
      const realDir = fs.realpathSync(dir);
      return ALLOWED_ROOTS.some(root => {
        try {
          const realRoot = fs.realpathSync(root);
          return realDir.startsWith(realRoot + path.sep) || realDir === realRoot;
        } catch {
          return false;
        }
      });
    } catch {
      return false;
    }
  }
}

function resolvePath(filePath: string, base?: string): string {
  const fp = expandTilde(filePath);
  if (path.isAbsolute(fp)) return fp;
  const expandedBase = base ? expandTilde(base) : undefined;
  if (expandedBase) return path.resolve(expandedBase, fp);
  return path.resolve(fp);
}

/**
 * Search for a file by relative path suffix using native Node.js recursion.
 * No shell commands — immune to injection.
 */
function findInRoot(roots: string[], relativePath: string, maxDepth = 8): string | null {
  const skipDirs = new Set(["node_modules", ".next", ".git", "dist"]);
  const target = relativePath.replace(/^\/+/, "");

  function search(dir: string, depth: number): string | null {
    if (depth > maxDepth) return null;
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return null;
    }
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isFile() && full.endsWith(target)) {
        return full;
      }
      if (entry.isDirectory() && !skipDirs.has(entry.name)) {
        const found = search(full, depth + 1);
        if (found) return found;
      }
    }
    return null;
  }

  for (const root of roots) {
    if (!fs.existsSync(root)) continue;
    const found = search(root, 0);
    if (found) return found;
  }
  return null;
}

export async function GET(req: NextRequest) {
  const filePath = req.nextUrl.searchParams.get("path");
  const base = req.nextUrl.searchParams.get("base") ?? undefined;

  if (!filePath) {
    return NextResponse.json({ error: "No path provided" }, { status: 400 });
  }

  // Block obvious path traversal attempts
  if (filePath.includes("..")) {
    return NextResponse.json({ error: "Path traversal not allowed" }, { status: 403 });
  }

  let resolved = resolvePath(filePath, base);
  const isRelative = !filePath.startsWith("~/") && !path.isAbsolute(filePath);

  // If not found and path is relative, search in allowed roots
  if (!fs.existsSync(resolved) && isRelative) {
    const searchRoots = ALLOWED_ROOTS.filter(r => fs.existsSync(r));
    const found = findInRoot(searchRoots, filePath);
    if (found) resolved = found;
  }

  // Validate the resolved path is within allowed directories
  if (!isPathAllowed(resolved)) {
    return NextResponse.json({ error: "Access denied — path outside allowed directories" }, { status: 403 });
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
