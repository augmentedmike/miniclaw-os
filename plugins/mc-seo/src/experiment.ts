/**
 * experiment.ts — SEO experiment engine (autoresearch)
 *
 * Creates, applies, measures, and reverts SEO experiments.
 * Pure functions where possible; side effects at the edges.
 */

import * as crypto from "node:crypto";
import * as child_process from "node:child_process";
import { SeoDb, type ExperimentRow, type AuditRow } from "./db.js";
import { auditPage } from "./audit.js";
import { checkRank } from "./rank-checker.js";
import type { SeoConfig } from "./config.js";

export type SeoExperiment = {
  id: string;
  domain: string;
  url: string;
  hypothesis: string;
  change: {
    type: "title" | "meta" | "h1" | "content" | "schema" | "og" | "new-page";
    before: string;
    after: string;
    file?: string;
    commit?: string;
  };
  metric: string;
  baselineValue: number;
  resultValue?: number;
  status: "proposed" | "applied" | "waiting" | "measured" | "kept" | "reverted";
  appliedAt?: string;
  measuredAt?: string;
  waitDays: number;
};

function generateId(): string {
  return `exp_${crypto.randomBytes(6).toString("hex")}`;
}

/**
 * Convert an ExperimentRow from the DB into the SeoExperiment shape.
 */
export function rowToExperiment(row: ExperimentRow): SeoExperiment {
  return {
    id: row.id,
    domain: row.domain,
    url: row.url,
    hypothesis: row.hypothesis,
    change: {
      type: row.change_type as SeoExperiment["change"]["type"],
      before: row.change_before ?? "",
      after: row.change_after ?? "",
      file: row.change_file ?? undefined,
      commit: row.change_commit ?? undefined,
    },
    metric: row.metric,
    baselineValue: row.baseline_value ?? 0,
    resultValue: row.result_value ?? undefined,
    status: row.status as SeoExperiment["status"],
    appliedAt: row.applied_at ?? undefined,
    measuredAt: row.measured_at ?? undefined,
    waitDays: row.wait_days,
  };
}

/**
 * Create an experiment from the worst audit issue on the worst-scoring page.
 * Returns the experiment proposal (status=proposed), or null if nothing to fix.
 */
export function createExperiment(db: SeoDb, domain: string): SeoExperiment | null {
  const audits = db.getLatestAudits(domain);
  if (audits.length === 0) return null;

  // Find the worst page
  const worst = audits[0]; // already sorted by score ASC
  const raw = parseRaw(worst);
  if (!raw) return null;

  // Find the worst failing check
  const failingChecks = raw.checks
    .filter((c: { status: string }) => c.status === "fail")
    .sort((a: { maxPoints: number; points: number }, b: { maxPoints: number; points: number }) =>
      (b.maxPoints - b.points) - (a.maxPoints - a.points)
    );

  if (failingChecks.length === 0) return null;

  const check = failingChecks[0];
  const changeType = mapCheckToChangeType(check.id);
  const hypothesis = `Fixing "${check.name}" on ${worst.url} will improve the page score and ranking`;

  const exp: SeoExperiment = {
    id: generateId(),
    domain,
    url: worst.url,
    hypothesis,
    change: {
      type: changeType,
      before: check.value ?? "",
      after: check.suggestion ?? "",
    },
    metric: "score",
    baselineValue: worst.score,
    status: "proposed",
    waitDays: 7,
  };

  db.createExperiment({
    id: exp.id,
    domain: exp.domain,
    url: exp.url,
    hypothesis: exp.hypothesis,
    change_type: exp.change.type,
    change_before: exp.change.before,
    change_after: exp.change.after,
    change_file: null,
    change_commit: null,
    metric: exp.metric,
    baseline_value: exp.baselineValue,
    result_value: null,
    applied_at: null,
    measured_at: null,
    created_at: new Date().toISOString(),
    card_id: null,
    wait_days: exp.waitDays,
  });

  return exp;
}

/**
 * Apply an experiment: for git-based sites, read the file, make the change, commit, push.
 * Updates the experiment status to "applied" / "waiting".
 */
export function applyExperiment(
  db: SeoDb,
  experimentId: string,
  opts: { repoDir: string; file: string; before: string; after: string }
): { ok: boolean; error?: string } {
  const exp = db.getExperiment(experimentId);
  if (!exp) return { ok: false, error: `Experiment ${experimentId} not found` };
  if (exp.status !== "proposed") return { ok: false, error: `Experiment is ${exp.status}, expected proposed` };

  const filePath = `${opts.repoDir}/${opts.file}`;

  // Read file
  let content: string;
  try {
    const result = child_process.execFileSync("cat", [filePath], { encoding: "utf8" });
    content = result;
  } catch (err) {
    return { ok: false, error: `Cannot read ${filePath}: ${err}` };
  }

  if (!content.includes(opts.before)) {
    return { ok: false, error: `"before" text not found in ${filePath}` };
  }

  // Replace
  const updated = content.replace(opts.before, opts.after);

  // Write
  try {
    const fs = require("node:fs");
    fs.writeFileSync(filePath, updated, "utf8");
  } catch (err) {
    return { ok: false, error: `Cannot write ${filePath}: ${err}` };
  }

  // Git commit
  const commitMsg = `seo: experiment ${experimentId} — ${exp.change_type} on ${exp.url}`;
  try {
    child_process.execFileSync("git", ["add", opts.file], { cwd: opts.repoDir, encoding: "utf8" });
    child_process.execFileSync("git", ["commit", "-m", commitMsg], { cwd: opts.repoDir, encoding: "utf8" });
  } catch (err) {
    return { ok: false, error: `Git commit failed: ${err}` };
  }

  // Get the commit hash
  let commitHash = "";
  try {
    commitHash = child_process.execFileSync("git", ["rev-parse", "HEAD"], { cwd: opts.repoDir, encoding: "utf8" }).trim();
  } catch {
    // non-critical
  }

  // Push
  try {
    child_process.execFileSync("git", ["push"], { cwd: opts.repoDir, encoding: "utf8" });
  } catch (err) {
    return { ok: false, error: `Git push failed: ${err}` };
  }

  const now = new Date().toISOString();
  db.updateExperiment(experimentId, {
    status: "waiting",
    change_before: opts.before,
    change_after: opts.after,
    change_file: opts.file,
    change_commit: commitHash,
    applied_at: now,
  });

  return { ok: true };
}

/**
 * Measure an experiment: re-run the audit/rank check, compare to baseline.
 */
export async function measureExperiment(
  db: SeoDb,
  experimentId: string,
  cfg: SeoConfig
): Promise<{ ok: boolean; improved: boolean; delta: number; error?: string }> {
  const exp = db.getExperiment(experimentId);
  if (!exp) return { ok: false, improved: false, delta: 0, error: `Experiment ${experimentId} not found` };
  if (exp.status !== "waiting" && exp.status !== "applied") {
    return { ok: false, improved: false, delta: 0, error: `Experiment is ${exp.status}, expected waiting/applied` };
  }

  let resultValue: number;

  if (exp.metric === "score") {
    const domCfg = cfg.domains[exp.domain] ?? { targetKeywords: [] };
    const audit = await auditPage(exp.url, domCfg.targetKeywords);
    resultValue = audit.score;
    db.saveAudit(exp.domain, exp.url, audit.score, audit.issues, audit.suggestions, audit);
  } else if (exp.metric.startsWith("rank:")) {
    const keyword = exp.metric.slice(5);
    const result = await checkRank(keyword, exp.domain, {
      googleApiKey: cfg.googleSearchApiKey,
      googleCx: cfg.googleSearchCx,
      bingApiKey: cfg.bingApiKey,
    });
    resultValue = result.position ?? 101; // 101 = not ranked
    db.saveRank(exp.domain, keyword, result.engine, result.position, result.url);
  } else {
    return { ok: false, improved: false, delta: 0, error: `Unknown metric: ${exp.metric}` };
  }

  const baseline = exp.baseline_value ?? 0;
  const delta = resultValue - baseline;
  // For score: higher is better. For rank: lower position is better.
  const improved = exp.metric === "score" ? delta > 0 : delta < 0;
  const now = new Date().toISOString();

  db.updateExperiment(experimentId, {
    status: "measured",
    result_value: resultValue,
    measured_at: now,
  });

  return { ok: true, improved, delta };
}

/**
 * Revert an experiment: git revert the commit.
 */
export function revertExperiment(
  db: SeoDb,
  experimentId: string,
  repoDir: string
): { ok: boolean; error?: string } {
  const exp = db.getExperiment(experimentId);
  if (!exp) return { ok: false, error: `Experiment ${experimentId} not found` };
  if (!exp.change_commit) return { ok: false, error: "No commit to revert" };

  try {
    child_process.execFileSync("git", ["revert", "--no-edit", exp.change_commit], {
      cwd: repoDir,
      encoding: "utf8",
    });
    child_process.execFileSync("git", ["push"], { cwd: repoDir, encoding: "utf8" });
  } catch (err) {
    return { ok: false, error: `Git revert failed: ${err}` };
  }

  db.updateExperiment(experimentId, { status: "reverted" });
  return { ok: true };
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function parseRaw(row: AuditRow): { checks: Array<{ id: string; name: string; status: string; value?: string; suggestion?: string; maxPoints: number; points: number }> } | null {
  try {
    return JSON.parse(row.raw);
  } catch {
    return null;
  }
}

function mapCheckToChangeType(checkId: string): SeoExperiment["change"]["type"] {
  if (checkId.startsWith("title")) return "title";
  if (checkId.startsWith("meta_desc")) return "meta";
  if (checkId.startsWith("h1")) return "h1";
  if (checkId.startsWith("schema")) return "schema";
  if (checkId.startsWith("og")) return "og";
  if (checkId.startsWith("word_count") || checkId.startsWith("keyword_in_body")) return "content";
  return "content";
}
