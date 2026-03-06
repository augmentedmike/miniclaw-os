"use client";

import { useState, useEffect, useCallback } from "react";
import type { Column } from "@/lib/types";

function jobId(column: Column) { return `board-${column}-triage`; }
function lsKey(column: Column) { return `mc-board:${column}-triage:enabled`; }
function jobName(column: Column) {
  const labels: Record<Column, string> = {
    backlog: "Backlog Triage",
    "in-progress": "In Progress Triage",
    "in-review": "In Review Triage",
    shipped: "Shipped",
  };
  return labels[column];
}

export interface TriageColumnState {
  cronEnabled: boolean;
  cronMinutes: number;
  cronLoaded: boolean;
  handleToggleCron: (e: React.MouseEvent) => void;
  handleMinutesChange: (e: React.ChangeEvent<HTMLSelectElement>) => void;
}

export function useTriageColumn(column: Column): TriageColumnState {
  const [cronEnabled, setCronEnabled] = useState(false);
  const [cronMinutes, setCronMinutes] = useState(5);
  const [cronLoaded, setCronLoaded] = useState(false);

  useEffect(() => {
    const lsVal = localStorage.getItem(lsKey(column));
    if (lsVal !== null) setCronEnabled(lsVal === "true");

    fetch("/api/cron")
      .then(r => r.json())
      .then(d => {
        const job = (d.jobs ?? []).find((j: { id: string }) => j.id === jobId(column));
        if (job) {
          const enabled = job.enabled !== false;
          setCronEnabled(enabled);
          localStorage.setItem(lsKey(column), String(enabled));
          const m = job.schedule?.match(/^\*\/(\d+) \* \* \* \*$/);
          setCronMinutes(m ? parseInt(m[1], 10) : 5);
        }
        setCronLoaded(true);
      })
      .catch(() => { setCronLoaded(true); });
  }, [column]);

  const patchCron = useCallback(async (patch: { enabled?: boolean; schedule?: string }) => {
    const res = await fetch("/api/cron", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: jobId(column), ...patch }),
    });
    if (res.status === 404) {
      await fetch("/api/cron", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: jobId(column),
          name: jobName(column),
          schedule: `*/${cronMinutes} * * * *`,
          enabled: false,
          ...patch,
        }),
      });
    }
  }, [column, cronMinutes]);

  const handleToggleCron = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    if (!cronLoaded) return;
    const next = !cronEnabled;
    setCronEnabled(next);
    localStorage.setItem(lsKey(column), String(next));
    patchCron({ enabled: next }).catch(() => {
      setCronEnabled(!next);
      localStorage.setItem(lsKey(column), String(!next));
    });
  }, [column, cronEnabled, cronLoaded, patchCron]);

  const handleMinutesChange = useCallback((e: React.ChangeEvent<HTMLSelectElement>) => {
    const mins = parseInt(e.target.value, 10);
    setCronMinutes(mins);
    patchCron({ schedule: `*/${mins} * * * *` }).catch(() => {});
  }, [patchCron]);

  return { cronEnabled, cronMinutes, cronLoaded, handleToggleCron, handleMinutesChange };
}
