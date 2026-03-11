import { NextRequest, NextResponse } from "next/server";
import { listBoardCards, getShippedIds, listProjects, getActiveWork, getRecentAgentRuns, getRecentWorkLog, getRunningByCol } from "@/lib/data";
import { sortCards } from "@/lib/sort";

export const dynamic = "force-dynamic";

export function GET(req: NextRequest) {
  const projectId = req.nextUrl.searchParams.get("project") ?? undefined;
  const { active, log } = getActiveWork();
  const activeIds = active.map(e => e.cardId);
  const activeIdSet = new Set(activeIds);
  const cards = sortCards(listBoardCards(projectId), activeIdSet);
  const projects = listProjects();
  const activeWorkers: Record<string, string> = {};
  for (const e of active) {
    if (e.worker) activeWorkers[e.cardId] = e.worker.replace("board-worker-", "");
  }
  const counts = {
    backlog: cards.filter(c => c.column === "backlog").length,
    inProgress: cards.filter(c => c.column === "in-progress").length,
    inReview: cards.filter(c => c.column === "in-review").length,
    shipped: cards.filter(c => c.column === "shipped").length,
  };
  const globalShippedIds = getShippedIds();
  const recentLog = log.slice(-100);
  const agentRuns = getRecentAgentRuns();
  const workLog = getRecentWorkLog();
  const runningByCol = getRunningByCol();
  return NextResponse.json({ cards, projects, activeIds, activeWorkers, log: recentLog, counts, globalShippedIds, agentRuns, workLog, runningByCol });
}
