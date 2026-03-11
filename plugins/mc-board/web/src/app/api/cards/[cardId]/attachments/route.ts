import { NextRequest, NextResponse } from "next/server";
import * as path from "node:path";
import * as os from "node:os";
import Database from "better-sqlite3";

export const dynamic = "force-dynamic";

const STATE_DIR = process.env.MINICLAW_STATE_DIR ?? process.env.OPENCLAW_STATE_DIR ?? path.join(os.homedir(), ".miniclaw");
const DB_PATH = path.join(STATE_DIR, "user", "augmentedmike_bot", "brain", "board.db");

function getDb() {
  return new Database(DB_PATH);
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ cardId: string }> }) {
  const { cardId } = await params;
  const db = getDb();
  try {
    const row = db.prepare("SELECT attachments FROM cards WHERE id = ?").get(cardId) as { attachments: string } | undefined;
    if (!row) return new NextResponse("not found", { status: 404 });
    const attachments = JSON.parse(row.attachments || "[]");
    return NextResponse.json({ attachments });
  } finally {
    db.close();
  }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ cardId: string }> }) {
  const { cardId } = await params;
  const body = await req.json() as { path: string; label?: string; mime?: string };
  if (!body.path) return new NextResponse("path required", { status: 400 });

  const db = getDb();
  try {
    const row = db.prepare("SELECT attachments FROM cards WHERE id = ?").get(cardId) as { attachments: string } | undefined;
    if (!row) return new NextResponse("not found", { status: 404 });

    const attachments = JSON.parse(row.attachments || "[]") as Array<Record<string, unknown>>;
    attachments.push({
      path: body.path,
      label: body.label ?? "",
      mime: body.mime ?? "image/png",
      created_at: new Date().toISOString(),
    });

    db.prepare("UPDATE cards SET attachments = ?, updated_at = datetime('now') WHERE id = ?")
      .run(JSON.stringify(attachments), cardId);

    return NextResponse.json({ ok: true, count: attachments.length });
  } finally {
    db.close();
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ cardId: string }> }) {
  const { cardId } = await params;
  const { searchParams } = new URL(req.url);
  const filePath = searchParams.get("path");
  if (!filePath) return new NextResponse("path required", { status: 400 });

  const db = getDb();
  try {
    const row = db.prepare("SELECT attachments FROM cards WHERE id = ?").get(cardId) as { attachments: string } | undefined;
    if (!row) return new NextResponse("not found", { status: 404 });

    const attachments = (JSON.parse(row.attachments || "[]") as Array<Record<string, unknown>>)
      .filter(a => a.path !== filePath);

    db.prepare("UPDATE cards SET attachments = ?, updated_at = datetime('now') WHERE id = ?")
      .run(JSON.stringify(attachments), cardId);

    return NextResponse.json({ ok: true, count: attachments.length });
  } finally {
    db.close();
  }
}
