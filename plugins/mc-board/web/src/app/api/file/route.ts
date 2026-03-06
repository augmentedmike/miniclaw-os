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

function resolvePath(filePath: string, base?: string): string {
  if (filePath.startsWith("~/")) {
    return path.join(os.homedir(), filePath.slice(2));
  }
  if (path.isAbsolute(filePath)) {
    return filePath;
  }
  // Relative — resolve against base if provided
  if (base) {
    return path.resolve(base, filePath);
  }
  return path.resolve(filePath);
}

export async function GET(req: NextRequest) {
  const filePath = req.nextUrl.searchParams.get("path");
  const base = req.nextUrl.searchParams.get("base") ?? undefined;

  if (!filePath) {
    return NextResponse.json({ error: "No path provided" }, { status: 400 });
  }

  const resolved = resolvePath(filePath, base);
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
