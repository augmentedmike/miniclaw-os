import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export function GET() {
  const agents = [
    { id: 1, name: "Board Worker", status: "active", task: "Processing backlog" },
    { id: 2, name: "Email Triage", status: "idle", task: null },
    { id: 3, name: "TG Handler", status: "active", task: "Responding to message" },
  ];

  return NextResponse.json(agents);
}
