"use client";

import { useState, useEffect, useCallback } from "react";
import type { Column } from "@/lib/types";

function jobId(column: Column) { return `board-${column}-triage`; }
function jobName(column: Column) {
  const labels: Record<Column, string> = {
    backlog: "Backlog Triage",
    "in-progress": "In Progress Triage",
    "in-review": "In Review Triage",
    "on-hold": "On Hold",
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
    // Load state from API (queue_settings DB + cron jobs) — no localStorage
    fetch("/api/cron")
      .then(r => r.json())
      .then(d => {
        const job = (d.jobs ?? []).find((j: { id: string }) => j.id === jobId(column));
        if (job) {
          // queueEnabled comes from the DB-authoritative queue_settings table
          const enabled = job.queueEnabled !== undefined ? job.queueEnabled : (job.enabled !== false);
          setCronEnabled(enabled);
          // queueIntervalMs comes from DB; fall back to parsing cron schedule
          if (job.queueIntervalMs) {
            setCronMinutes(Math.round(job.queueIntervalMs / 60_000));
          } else {
            const m = job.schedule?.match(/^\*\/(\d+) \* \* \* \*$/);
            setCronMinutes(m ? parseInt(m[1], 10) : 5);
          }
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
    // Write to DB via PATCH /api/cron (which now writes to queue_settings too)
    patchCron({ enabled: next }).catch(() => {
      setCronEnabled(!next);
    });
  }, [column, cronEnabled, cronLoaded, patchCron]);

  const handleMinutesChange = useCallback((e: React.ChangeEvent<HTMLSelectElement>) => {
    const mins = parseInt(e.target.value, 10);
    setCronMinutes(mins);
    // Write to both cron JSON and queue_settings DB via PATCH /api/cron
    patchCron({ schedule: `*/${mins} * * * *` }).catch(() => {});
  }, [patchCron]);

  return { cronEnabled, cronMinutes, cronLoaded, handleToggleCron, handleMinutesChange };
}
