import { getDb } from "./data";

const db = () => {
  const d = getDb();
  if (!d) throw new Error("Board DB not available");
  return d;
};

export function moveCard(id: string, target: string, _force = false): string {
  const now = new Date().toISOString();
  db().prepare("UPDATE cards SET col = ?, updated_at = ? WHERE id = ?").run(target, now, id);
  db().prepare("INSERT INTO card_history (card_id, col, moved_at) VALUES (?, ?, ?)").run(id, target, now);
  return `Moved ${id} to ${target}`;
}

export function pickupCard(id: string, worker: string): string {
  const card = db().prepare("SELECT id, title, col, project_id FROM cards WHERE id = ?").get(id) as { id: string; title: string; col: string; project_id: string | null } | undefined;
  if (!card) throw new Error(`Card ${id} not found`);
  const now = new Date().toISOString();
  db().prepare("INSERT OR REPLACE INTO active_work (card_id, project_id, title, worker, col, picked_up_at) VALUES (?, ?, ?, ?, ?, ?)").run(id, card.project_id, card.title, worker, card.col, now);
  db().prepare("INSERT INTO pickup_log (card_id, project_id, title, worker, col, action, at) VALUES (?, ?, ?, ?, ?, ?, ?)").run(id, card.project_id, card.title, worker, card.col, "pickup", now);
  // Increment pickup_count so the pickup-limits system can track stuck cards
  db().prepare("UPDATE cards SET pickup_count = pickup_count + 1 WHERE id = ?").run(id);
  return `Picked up ${id}`;
}

export function releaseCard(id: string, worker: string): string {
  const now = new Date().toISOString();
  const active = db().prepare("SELECT project_id, title, col, picked_up_at FROM active_work WHERE card_id = ?").get(id) as { project_id: string | null; title: string; col: string; picked_up_at: string } | undefined;
  db().prepare("DELETE FROM active_work WHERE card_id = ?").run(id);
  if (active) {
    db().prepare("INSERT INTO pickup_log (card_id, project_id, title, worker, col, action, at) VALUES (?, ?, ?, ?, ?, ?, ?)").run(id, active.project_id, active.title, worker, active.col, "release", now);

    // Record agent_run if the runner didn't already write one for this pickup
    const startedAt = active.picked_up_at;
    const durationMs = new Date(now).getTime() - new Date(startedAt).getTime();
    const runId = `${startedAt.replace(/[:.]/g, "-").slice(0, 19)}-${id}`;
    const existing = db().prepare("SELECT id FROM agent_runs WHERE id = ?").get(runId);
    if (!existing) {
      try {
        db().prepare(
          `INSERT INTO agent_runs (id, card_id, column, started_at, ended_at, duration_ms, exit_code, tool_call_count, tool_calls, log_file, debug_log_file)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        ).run(runId, id, active.col, startedAt, now, durationMs, 0, 0, "[]", "", "");
      } catch {}
    }
  }
  return `Released ${id}`;
}

export function updateCard(id: string, updates: Record<string, string>): string {
  const now = new Date().toISOString();
  const sets: string[] = ["updated_at = ?"];
  const vals: (string | number)[] = [now];

  for (const [k, v] of Object.entries(updates)) {
    // Map CLI flag names to DB column names
    const colMap: Record<string, string> = {
      priority: "priority",
      tags: "tags",
      notes: "notes",
      research: "research",
      review: "review_notes",
      criteria: "acceptance_criteria",
      plan: "implementation_plan",
      description: "problem_description",
      log: "work_log",
      title: "title",
    };
    const col = colMap[k];
    if (col) {
      // Tags need to be JSON array
      if (k === "tags") {
        const arr = v.split(",").map(t => t.trim()).filter(Boolean);
        sets.push(`${col} = ?`);
        vals.push(JSON.stringify(arr));
      } else {
        sets.push(`${col} = ?`);
        vals.push(v);
      }
    }
  }

  // Handle add-tags / remove-tags (atomic tag operations)
  if (updates["add-tags"] || updates["remove-tags"]) {
    const row = db().prepare("SELECT tags FROM cards WHERE id = ?").get(id) as { tags: string } | undefined;
    let current: string[] = [];
    try { current = JSON.parse(row?.tags ?? "[]"); } catch { /* empty */ }

    if (updates["add-tags"]) {
      const toAdd = updates["add-tags"].split(",").map((t: string) => t.trim()).filter(Boolean);
      for (const t of toAdd) {
        if (!current.includes(t)) current.push(t);
      }
    }
    if (updates["remove-tags"]) {
      const toRemove = new Set(updates["remove-tags"].split(",").map((t: string) => t.trim()));
      current = current.filter(t => !toRemove.has(t));
    }

    sets.push("tags = ?");
    vals.push(JSON.stringify(current));
  }

  // Handle move_to
  if (updates.move_to) {
    sets.push("col = ?");
    vals.push(updates.move_to);
  }

  vals.push(id);
  db().prepare(`UPDATE cards SET ${sets.join(", ")} WHERE id = ?`).run(...vals);

  // If moved, add history entry
  if (updates.move_to) {
    db().prepare("INSERT INTO card_history (card_id, col, moved_at) VALUES (?, ?, ?)").run(id, updates.move_to, now);
  }

  return `Updated ${id}`;
}
