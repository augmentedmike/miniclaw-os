import { NextRequest, NextResponse } from "next/server";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import * as crypto from "node:crypto";

export const dynamic = "force-dynamic";

const STATE_DIR = process.env.OPENCLAW_STATE_DIR ?? path.join(os.homedir(), ".openclaw");
const MEDIA_DIR = path.join(STATE_DIR, "media", "attachments");

const ALLOWED_MIME: Record<string, string> = {
  "image/png": ".png",
  "image/jpeg": ".jpg",
  "image/gif": ".gif",
  "image/webp": ".webp",
};

const MAX_SIZE = 10 * 1024 * 1024; // 10MB

export async function POST(req: NextRequest) {
  const formData = await req.formData();
  const file = formData.get("file") as File | null;
  const cardId = formData.get("cardId") as string | null;
  if (!file) return new NextResponse("file required", { status: 400 });

  const ext = ALLOWED_MIME[file.type];
  if (!ext) return new NextResponse(`unsupported type: ${file.type}`, { status: 400 });
  if (file.size > MAX_SIZE) return new NextResponse("file too large (10MB max)", { status: 400 });

  const buf = Buffer.from(await file.arrayBuffer());
  const hash = crypto.createHash("sha256").update(buf).digest("hex").slice(0, 12);
  const filename = `${Date.now()}-${hash}${ext}`;

  const subdir = cardId ? path.join(MEDIA_DIR, cardId) : MEDIA_DIR;
  fs.mkdirSync(subdir, { recursive: true });

  const filePath = path.join(subdir, filename);
  fs.writeFileSync(filePath, buf);

  return NextResponse.json({ path: filePath, filename, size: buf.length });
}
