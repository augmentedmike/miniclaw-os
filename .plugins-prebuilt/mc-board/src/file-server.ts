import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";

/**
 * File serving utility for board file viewer.
 * Handles path validation, content type detection, and rendering.
 */

export interface FileServeOptions {
  stateDir: string; // OPENCLAW_STATE_DIR
}

export interface ServedFile {
  path: string;
  type: "markdown" | "image" | "pdf" | "video" | "text" | "unknown";
  content?: Buffer | string; // Buffer for binary, string for text
  mimeType: string;
}

export class FileServer {
  private stateDir: string;

  constructor(opts: FileServeOptions) {
    this.stateDir = opts.stateDir;
  }

  /**
   * Resolve a user-provided path (with ~ expansion) to absolute path.
   * Returns null if path tries to escape stateDir (security).
   */
  private resolvePath(userPath: string): string | null {
    let resolved: string;

    if (userPath.startsWith("~/")) {
      resolved = path.join(os.homedir(), userPath.slice(2));
    } else if (userPath.startsWith("/")) {
      resolved = userPath;
    } else {
      // Relative path — resolve relative to stateDir
      resolved = path.join(this.stateDir, userPath);
    }

    // Normalize to prevent traversal
    resolved = path.resolve(resolved);

    // Whitelist check: must be within OPENCLAW_STATE_DIR or home directory
    // (allow reading from workspace, media, etc. under ~/.openclaw/)
    const home = os.homedir();
    if (!resolved.startsWith(home)) {
      return null; // Outside home directory
    }

    return resolved;
  }

  /**
   * Serve a file from the filesystem.
   * Returns ServedFile with type and content if successful.
   */
  async serveFile(userPath: string): Promise<ServedFile | { error: string }> {
    const resolved = this.resolvePath(userPath);
    if (!resolved) {
      return { error: "Path outside allowed directories" };
    }

    try {
      // Check file exists and is readable
      await fs.promises.access(resolved, fs.constants.F_OK);

      const stat = await fs.promises.stat(resolved);
      if (!stat.isFile()) {
        return { error: "Not a file" };
      }

      const ext = path.extname(resolved).toLowerCase();
      const type = this.detectType(ext);
      const mimeType = this.detectMimeType(ext);

      // Read file content (with size limit for safety)
      const maxSize = 50 * 1024 * 1024; // 50MB
      if (stat.size > maxSize) {
        return {
          error: `File too large (${(stat.size / 1024 / 1024).toFixed(2)}MB, max 50MB)`,
        };
      }

      let content: Buffer | string;
      if (type === "image" || type === "pdf" || type === "video") {
        // Binary — return as buffer (will be base64 encoded in HTTP response)
        content = await fs.promises.readFile(resolved);
      } else {
        // Text — return as string
        content = await fs.promises.readFile(resolved, "utf-8");
      }

      return {
        path: resolved,
        type,
        mimeType,
        content,
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes("ENOENT")) {
        return { error: "File not found" };
      }
      if (msg.includes("EACCES")) {
        return { error: "Permission denied" };
      }
      return { error: `Failed to read file: ${msg}` };
    }
  }

  private detectType(
    ext: string,
  ): "markdown" | "image" | "pdf" | "video" | "text" | "unknown" {
    if (ext === ".md" || ext === ".mdx") return "markdown";
    if ([".jpg", ".jpeg", ".png", ".gif", ".webp", ".svg"].includes(ext)) return "image";
    if (ext === ".pdf") return "pdf";
    if ([".mp4", ".webm", ".mov", ".avi"].includes(ext)) return "video";
    if (
      [".txt", ".json", ".yaml", ".yml", ".xml", ".csv", ".html", ".css", ".js", ".ts"]
        .includes(ext)
    ) return "text";
    return "unknown";
  }

  private detectMimeType(ext: string): string {
    const types: Record<string, string> = {
      ".md": "text/markdown",
      ".mdx": "text/markdown",
      ".json": "application/json",
      ".jpg": "image/jpeg",
      ".jpeg": "image/jpeg",
      ".png": "image/png",
      ".gif": "image/gif",
      ".webp": "image/webp",
      ".svg": "image/svg+xml",
      ".pdf": "application/pdf",
      ".mp4": "video/mp4",
      ".webm": "video/webm",
      ".mov": "video/quicktime",
      ".avi": "video/x-msvideo",
      ".txt": "text/plain",
      ".html": "text/html",
      ".css": "text/css",
      ".js": "application/javascript",
      ".ts": "application/typescript",
      ".xml": "application/xml",
      ".yaml": "text/yaml",
      ".yml": "text/yaml",
      ".csv": "text/csv",
    };
    return types[ext] ?? "application/octet-stream";
  }
}

/**
 * Extract file paths from text using common patterns.
 * Detects /Users/... and ~/... paths.
 */
export function extractFilePaths(text: string): string[] {
  const patterns = [
    /~\/[^\s\)\]\}\|`]*/g, // ~/path/to/file
    /\/Users\/[^\s\)\]\}\|`]*/g, // /Users/...
  ];

  const paths: string[] = [];
  for (const pattern of patterns) {
    const matches = text.match(pattern);
    if (matches) {
      paths.push(...matches);
    }
  }

  // Remove duplicates and obvious non-file patterns
  return [...new Set(paths)].filter(p => {
    // Remove paths ending with common sentence punctuation
    while (p.endsWith(".") || p.endsWith(",") || p.endsWith(";")) {
      p = p.slice(0, -1);
    }
    return p.length > 1;
  });
}
