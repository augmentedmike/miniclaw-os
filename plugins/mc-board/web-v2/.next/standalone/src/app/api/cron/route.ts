import { NextResponse } from "next/server";
import { listCronJobs, listCronRuns } from "@/lib/cron";

export const dynamic = "force-dynamic";

export function GET() {
  return NextResponse.json({ jobs: listCronJobs(), runs: listCronRuns() });
}
