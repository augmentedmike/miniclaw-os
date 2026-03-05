import { NextResponse } from "next/server";
import { getActiveWork } from "@/lib/data";

export const dynamic = "force-dynamic";

export function GET() {
  return NextResponse.json(getActiveWork());
}
