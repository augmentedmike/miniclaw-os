import { NextRequest, NextResponse } from "next/server";
import * as fs from "node:fs";
import * as path from "node:path";

export const dynamic = "force-dynamic";

function getLayoutsDir(): string {
  const stateDir =
    process.env.OPENCLAW_STATE_DIR ??
    path.join(process.env.HOME ?? "", ".openclaw", "miniclaw");
  return path.join(stateDir, "USER", "brain", "office-layouts");
}

export function GET() {
  try {
    const dir = getLayoutsDir();
    if (!fs.existsSync(dir)) {
      return NextResponse.json({ layouts: [] });
    }

    const files = fs.readdirSync(dir).filter(
      (f) => f.endsWith(".json") && !f.startsWith("_")
    );

    const layouts = files.map((f) => {
      try {
        const data = JSON.parse(fs.readFileSync(path.join(dir, f), "utf-8"));
        return {
          name: path.basename(f, ".json"),
          cols: data.cols ?? 0,
          rows: data.rows ?? 0,
        };
      } catch { /* malformed layout JSON — return defaults */
        return { name: path.basename(f, ".json"), cols: 0, rows: 0 };
      }
    });

    return NextResponse.json({ layouts });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { name, layout } = body;

    if (!name || typeof name !== "string") {
      return NextResponse.json({ error: "name is required" }, { status: 400 });
    }
    if (!layout || typeof layout !== "object") {
      return NextResponse.json(
        { error: "layout is required" },
        { status: 400 }
      );
    }

    // Sanitize name — only allow alphanumeric, hyphens, underscores
    const safeName = name.replace(/[^a-zA-Z0-9_-]/g, "");
    if (!safeName) {
      return NextResponse.json({ error: "invalid name" }, { status: 400 });
    }

    const dir = getLayoutsDir();
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

    const filePath = path.join(dir, `${safeName}.json`);
    if (fs.existsSync(filePath)) {
      return NextResponse.json(
        { error: "layout already exists" },
        { status: 409 }
      );
    }

    fs.writeFileSync(filePath, JSON.stringify(layout, null, 2));
    return NextResponse.json({ ok: true, name: safeName });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
