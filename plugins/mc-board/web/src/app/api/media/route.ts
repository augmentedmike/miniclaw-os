import { NextRequest, NextResponse } from "next/server";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";

export const dynamic = "force-dynamic";

const STATE_DIR = process.env.OPENCLAW_STATE_DIR ?? path.join(os.homedir(), ".openclaw");

const ALLOWED_ROOTS = [
  path.join(STATE_DIR, "media"),
];

const MIME: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
};

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const filePath = searchParams.get("path");
  if (!filePath) return new NextResponse("path required", { status: 400 });

  // Resolve and verify path stays within allowed roots
  const resolved = path.resolve(filePath.replace(/^~\//, os.homedir() + "/"));
  const allowed = ALLOWED_ROOTS.some(root => resolved.startsWith(root));
  if (!allowed) return new NextResponse("forbidden", { status: 403 });

  if (!fs.existsSync(resolved)) return new NextResponse("not found", { status: 404 });

  const ext = path.extname(resolved).toLowerCase();
  const mime = MIME[ext] ?? "application/octet-stream";

  const buf = fs.readFileSync(resolved);
  return new NextResponse(buf, {
    headers: {
      "Content-Type": mime,
      "Cache-Control": "public, max-age=3600",
    },
  });
}
