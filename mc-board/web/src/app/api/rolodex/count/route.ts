import { NextResponse } from "next/server";
import { getContactCount } from "@/lib/rolodex";

export async function GET() {
  return NextResponse.json({ count: getContactCount() });
}
