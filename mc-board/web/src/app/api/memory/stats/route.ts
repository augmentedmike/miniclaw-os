import { NextResponse } from "next/server";
import { getMemoryStats } from "@/lib/memory-stats";

export async function GET() {
  return NextResponse.json(getMemoryStats());
}
