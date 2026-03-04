#!/usr/bin/env node
/**
 * Miniclaw Dashboard — standalone web server
 * Port 4220 · Tabs: Board | Memory | Cron
 * Installed as: com.augmentedmike.miniclaw-brain-web (LaunchAgent)
 */

import * as http from "node:http";
import * as url from "node:url";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { spawnSync } from "node:child_process";

// ---- Config ----

function resolveConfig() {
  const configPath = path.join(os.homedir(), ".openclaw", "openclaw.json");
  try {
    const raw = JSON.parse(fs.readFileSync(configPath, "utf-8"));
    const entry = raw?.plugins?.entries?.["mc-board"]?.config
      ?? raw?.plugins?.entries?.["miniclaw-brain"]?.config
      ?? {};
    const cardsDir = resolvePath(
      entry.cardsDir ?? "~/.openclaw/user/augmentedmike_bot/brain/cards",
    );
    const webPort = Number(entry.webPort ?? 4220);
    const stateDir = path.dirname(cardsDir);
    const projectsDir = path.join(stateDir, "projects");
    return { cardsDir, projectsDir, stateDir, webPort };
  } catch {
    const cardsDir = path.join(os.homedir(), ".openclaw", "user", "augmentedmike_bot", "brain", "cards");
    const stateDir = path.dirname(cardsDir);
    return {
      cardsDir,
      projectsDir: path.join(stateDir, "projects"),
      stateDir,
      webPort: 4220,
    };
  }
}

function resolvePath(p) {
  return p.startsWith("~/") ? path.join(os.homedir(), p.slice(2)) : p;
}

const KB_ENTRIES_DIR = resolvePath("~/am/user/augmentedmike_bot/kb/entries");
const CRON_JOBS_PATH = resolvePath("~/am/cron/jobs.json");
const CRON_RUNS_DIR  = resolvePath("~/am/cron/runs");
const QMD_BIN        = resolvePath("~/.bun/bin/qmd");

// ---- Card parsing ----

function parseFrontmatter(raw) {
  const result = {};
  const lines = raw.split("\n");
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) { i++; continue; }
    if (line.startsWith(" ") || line.startsWith("\t")) { i++; continue; }
    const colonIdx = line.indexOf(":");
    if (colonIdx === -1) { i++; continue; }
    const key = line.slice(0, colonIdx).trim();
    const rest = line.slice(colonIdx + 1).trim();
    if (!key) { i++; continue; }

    if (rest === "") {
      const items = [];
      i++;
      while (i < lines.length) {
        const subLine = lines[i];
        if (!subLine.startsWith("  ")) break;
        const trimmed = subLine.trimStart();
        if (trimmed.startsWith("- ")) {
          const item = {};
          const firstPart = trimmed.slice(2);
          if (firstPart.includes(":")) {
            const ci = firstPart.indexOf(":");
            const k = firstPart.slice(0, ci).trim();
            const v = firstPart.slice(ci + 1).trim();
            if (k) item[k] = v;
          }
          i++;
          while (i < lines.length && lines[i].startsWith("    ")) {
            const st = lines[i].trimStart();
            if (st.includes(":")) {
              const ci = st.indexOf(":");
              const k = st.slice(0, ci).trim();
              const v = st.slice(ci + 1).trim();
              if (k) item[k] = v;
            }
            i++;
          }
          items.push(item);
        } else {
          i++;
        }
      }
      result[key] = items;
    } else {
      if (rest.startsWith("[") && rest.endsWith("]")) {
        const inner = rest.slice(1, -1).trim();
        result[key] = inner === "" ? [] : inner.split(",").map(s => s.trim()).filter(Boolean);
      } else if (rest.startsWith('"') && rest.endsWith('"')) {
        result[key] = rest.slice(1, -1).replace(/\\"/g, '"');
      } else {
        result[key] = rest;
      }
      i++;
    }
  }
  return result;
}

function parseBody(bodyText) {
  const sectionMap = {
    "problem description": "problem_description",
    "implementation plan": "implementation_plan",
    "acceptance criteria": "acceptance_criteria",
    "notes / outcome": "notes",
    "review notes": "review_notes",
  };
  const result = {
    problem_description: "", implementation_plan: "",
    acceptance_criteria: "", notes: "", review_notes: "",
  };
  const parts = bodyText.split(/^## /m);
  for (const part of parts) {
    if (!part.trim()) continue;
    const newlineIdx = part.indexOf("\n");
    const header = (newlineIdx === -1 ? part : part.slice(0, newlineIdx)).trim();
    const content = newlineIdx === -1 ? "" : part.slice(newlineIdx + 1).trimEnd();
    const fieldKey = sectionMap[header.toLowerCase()];
    if (fieldKey) result[fieldKey] = content.trim();
  }
  return result;
}

function parseCard(content) {
  if (!content.startsWith("---")) throw new Error("Invalid card: missing frontmatter");
  const endFm = content.indexOf("\n---", 3);
  if (endFm === -1) throw new Error("Invalid card: unclosed frontmatter");
  const fmRaw = content.slice(4, endFm);
  const bodyRaw = content.slice(endFm + 4);
  const fm = parseFrontmatter(fmRaw);
  const body = parseBody(bodyRaw);
  const history = Array.isArray(fm.history)
    ? fm.history.filter(h => h.column && h.moved_at)
    : [];
  const tags = Array.isArray(fm.tags) ? fm.tags : [];
  return {
    id: String(fm.id ?? ""),
    title: String(fm.title ?? ""),
    column: fm.column ?? "backlog",
    priority: fm.priority ?? "medium",
    tags,
    project_id: fm.project_id ? String(fm.project_id) : undefined,
    created_at: String(fm.created_at ?? new Date().toISOString()),
    updated_at: String(fm.updated_at ?? new Date().toISOString()),
    history,
    ...body,
  };
}

function listCards(cardsDir) {
  try {
    const files = fs.readdirSync(cardsDir).filter(f => f.endsWith(".md"));
    return files.map(f => {
      const content = fs.readFileSync(path.join(cardsDir, f), "utf-8");
      return parseCard(content);
    });
  } catch {
    return [];
  }
}

// ---- Project loading ----

function listProjects(projectsDir) {
  try {
    fs.mkdirSync(projectsDir, { recursive: true });
    const files = fs.readdirSync(projectsDir).filter(f => f.endsWith(".json"));
    return files.map(f => JSON.parse(fs.readFileSync(path.join(projectsDir, f), "utf-8")));
  } catch {
    return [];
  }
}

// ---- KB data ----

function parseKbFrontmatter(content) {
  if (!content.startsWith("---")) return null;
  const endFm = content.indexOf("\n---", 3);
  if (endFm === -1) return null;
  const fmRaw = content.slice(4, endFm);
  const bodyRaw = content.slice(endFm + 4).trim();
  const fm = {};
  for (const line of fmRaw.split("\n")) {
    const ci = line.indexOf(":");
    if (ci === -1) continue;
    const key = line.slice(0, ci).trim();
    let val = line.slice(ci + 1).trim();
    if (!key) continue;
    if (val.startsWith('"') && val.endsWith('"')) val = val.slice(1, -1);
    if (val.startsWith("[") && val.endsWith("]")) {
      val = val.slice(1, -1).split(",").map(s => s.trim().replace(/^["']|["']$/g, "")).filter(Boolean);
    }
    fm[key] = val;
  }
  return { ...fm, _body: bodyRaw };
}

function readKbEntries() {
  try {
    const files = fs.readdirSync(KB_ENTRIES_DIR).filter(f => f.endsWith(".md"));
    const entries = [];
    for (const f of files) {
      try {
        const content = fs.readFileSync(path.join(KB_ENTRIES_DIR, f), "utf-8");
        const fm = parseKbFrontmatter(content);
        if (!fm) continue;
        entries.push({
          id: fm.id ?? f.replace(".md", ""),
          type: fm.type ?? "note",
          title: fm.title ?? f,
          summary: fm.summary ?? "",
          tags: Array.isArray(fm.tags) ? fm.tags : [],
          severity: fm.severity ?? "",
          source: fm.source ?? "",
          created_at: fm.created_at ?? "",
          updated_at: fm.updated_at ?? fm.created_at ?? "",
          body: fm._body ?? "",
        });
      } catch { /* skip bad files */ }
    }
    entries.sort((a, b) => (b.updated_at > a.updated_at ? 1 : -1));
    return entries;
  } catch {
    return [];
  }
}

// ---- Cron data ----

function fmtMs(ms) {
  if (!ms || isNaN(ms)) return "";
  const diff = Date.now() - ms;
  if (diff < 60_000) return "just now";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return `${Math.floor(diff / 86_400_000)}d ago`;
}

function fmtUntilMs(ms) {
  if (!ms || isNaN(ms)) return "";
  const diff = ms - Date.now();
  if (diff <= 0) return "now";
  if (diff < 60_000) return `in ${Math.ceil(diff / 1000)}s`;
  if (diff < 3_600_000) return `in ${Math.floor(diff / 60_000)}m`;
  if (diff < 86_400_000) return `in ${Math.floor(diff / 3_600_000)}h`;
  return `in ${Math.floor(diff / 86_400_000)}d`;
}

function fmtDuration(ms) {
  if (!ms || isNaN(ms)) return "";
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.floor(ms / 60_000)}m ${Math.floor((ms % 60_000) / 1000)}s`;
}

function formatSchedule(schedule) {
  if (!schedule) return "";
  if (schedule.kind === "every") {
    const ms = schedule.everyMs;
    if (ms < 60_000) return `every ${ms / 1000}s`;
    if (ms < 3_600_000) return `every ${ms / 60_000}m`;
    if (ms < 86_400_000) return `every ${ms / 3_600_000}h`;
    return `every ${ms / 86_400_000}d`;
  }
  if (schedule.kind === "cron") {
    return `${schedule.expr}${schedule.tz ? ` (${schedule.tz})` : ""}`;
  }
  return JSON.stringify(schedule);
}

function readCronData() {
  let jobs = [];
  try {
    const raw = JSON.parse(fs.readFileSync(CRON_JOBS_PATH, "utf-8"));
    jobs = raw.jobs ?? [];
  } catch { /* no jobs file */ }

  const runMap = {};
  try {
    const runFiles = fs.readdirSync(CRON_RUNS_DIR).filter(f => f.endsWith(".jsonl"));
    for (const f of runFiles) {
      try {
        const content = fs.readFileSync(path.join(CRON_RUNS_DIR, f), "utf-8");
        const lines = content.split("\n").filter(Boolean);
        const parsed = lines.map(l => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
        if (parsed.length === 0) continue;
        const jobId = parsed[0].jobId;
        if (!jobId) continue;
        // last 5 runs, newest first
        runMap[jobId] = parsed.slice(-5).reverse();
      } catch { /* skip bad files */ }
    }
  } catch { /* no runs dir */ }

  return { jobs, runs: runMap };
}

// ---- QMD recent files ----

const QMD_MEMORY_DIRS = [
  resolvePath("~/.miniclaw/user/personas/augmented-mike/memory"),
  resolvePath("~/am/workspace/memory"),
  resolvePath("~/am/user/augmentedmike_bot/memory"),
];

function readRecentQmdFiles(limit = 20) {
  const results = [];
  for (const dir of QMD_MEMORY_DIRS) {
    try {
      const files = fs.readdirSync(dir).filter(f => f.endsWith(".md"));
      for (const f of files) {
        const fullPath = path.join(dir, f);
        try {
          const stat = fs.statSync(fullPath);
          const content = fs.readFileSync(fullPath, "utf-8");
          const firstLine = content.split("\n").find(l => l.trim());
          const title = (firstLine ?? f).replace(/^#+\s*/, "").trim() || f;
          const snippet = content.slice(0, 300).replace(/^#+[^\n]*\n/, "").trim().slice(0, 200);
          results.push({
            file: fullPath,
            title,
            snippet,
            mtimeMs: stat.mtimeMs,
            collection: path.basename(dir),
          });
        } catch { /* skip */ }
      }
    } catch { /* dir not found */ }
  }
  results.sort((a, b) => b.mtimeMs - a.mtimeMs);
  return results.slice(0, limit);
}

// ---- HTML helpers ----

const COLUMN_STYLES = {
  "backlog":     { badge: "bg-zinc-600 text-zinc-100", label: "BACKLOG" },
  "in-progress": { badge: "bg-blue-600 text-blue-50",  label: "IN PROGRESS" },
  "in-review":   { badge: "bg-amber-500 text-amber-950", label: "IN REVIEW" },
  "shipped":     { badge: "bg-green-600 text-green-50", label: "SHIPPED" },
};

const PRIORITY_COLORS = { high: "#ef4444", medium: "#f97316", low: "#52525b" };
const COLUMNS = ["backlog", "in-progress", "in-review", "shipped"];

function escHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;")
    .replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

function fmtDate(iso) {
  try {
    const diff = Date.now() - new Date(iso).getTime();
    if (diff < 60_000) return "just now";
    if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
    if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
    return `${Math.floor(diff / 86_400_000)}d ago`;
  } catch { return iso; }
}

function criteriaProgress(criteria) {
  const total = (criteria.match(/^- \[[ x]\]/gm) ?? []).length;
  const checked = (criteria.match(/^- \[x\]/gm) ?? []).length;
  return { checked, total };
}

function progressBar(checked, total) {
  if (total === 0) return "";
  const pct = Math.round((checked / total) * 100);
  const color = pct === 100 ? "#22c55e" : pct >= 50 ? "#f97316" : "#3b82f6";
  return `<div class="criteria-bar" title="${checked}/${total} done (${pct}%)">
    <div class="criteria-fill" style="width:${pct}%;background:${color}"></div></div>
    <span class="criteria-label">${checked}/${total} criteria</span>`;
}

function renderCardDetail(card, project) {
  const style = COLUMN_STYLES[card.column] ?? COLUMN_STYLES.backlog;
  const priorityColor = PRIORITY_COLORS[card.priority] ?? PRIORITY_COLORS.low;
  const { checked, total } = criteriaProgress(card.acceptance_criteria);
  const tagsHtml = card.tags.length > 0
    ? card.tags.map(t => `<span class="tag">${escHtml(t)}</span>`).join("") : "";
  const breadcrumbBase = project
    ? `<a class="breadcrumb-link" href="/board/${escHtml(project.id)}">${escHtml(project.name)}</a>`
    : `<a class="breadcrumb-link" href="/board">Board</a>`;
  const sections = [
    { label: "Problem Description", content: card.problem_description },
    { label: "Implementation Plan", content: card.implementation_plan },
    { label: "Acceptance Criteria", content: card.acceptance_criteria },
    { label: "Notes / Outcome", content: card.notes },
    { label: "Review Notes", content: card.review_notes },
  ];
  const sectionsHtml = sections.filter(s => s.content?.trim()).map(s => `
    <section class="ds">
      <h2 class="ds-title">${escHtml(s.label)}</h2>
      <div class="ds-body">${escHtml(s.content).replace(/- \[x\]/g,'<span style="color:#22c55e">✓</span>').replace(/- \[ \]/g,'<span style="color:#52525b">○</span>').replace(/\n/g,'<br>')}</div>
    </section>`).join("");
  const historyHtml = (card.history ?? []).map(h =>
    `<li><span class="ds-hcol">${escHtml(h.column)}</span> <span class="ds-hdate">${fmtDate(h.moved_at)}</span></li>`).join("");
  const pbar = total > 0 ? progressBar(checked, total) : "";
  return `<!DOCTYPE html><html lang="en"><head>
  <meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0">
  <title>${escHtml(card.title)} — Brain Board</title>
  <style>
    *,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
    body{background:#09090b;color:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,monospace;padding:28px;min-height:100vh}
    a{color:inherit}
    .wrap{max-width:820px;margin:0 auto}
    .crumb{font-size:12px;color:#71717a;margin-bottom:20px;display:flex;align-items:center;gap:6px}
    .breadcrumb-link{color:#93c5fd;text-decoration:none}.breadcrumb-link:hover{text-decoration:underline}
    .crumb-sep{color:#3f3f46}
    .card-id{font-size:11px;color:#52525b;font-family:monospace;margin-bottom:8px}
    .card-title{font-size:26px;font-weight:700;color:#fafafa;line-height:1.3;margin-bottom:14px}
    .meta-row{display:flex;align-items:center;gap:12px;flex-wrap:wrap;margin-bottom:12px}
    .col-badge{font-size:11px;font-weight:700;letter-spacing:.06em;padding:3px 10px;border-radius:9999px}
    .bg-zinc-600{background:#52525b}.text-zinc-100{color:#f4f4f5}
    .bg-blue-600{background:#2563eb}.text-blue-50{color:#eff6ff}
    .bg-amber-500{background:#f59e0b}.text-amber-950{color:#451a03}
    .bg-green-600{background:#16a34a}.text-green-50{color:#f0fdf4}
    .prio{display:flex;align-items:center;gap:6px;font-size:12px;color:#a1a1aa}
    .prio-dot{width:8px;height:8px;border-radius:50%}
    .tag{font-size:10px;padding:1px 6px;border-radius:4px;background:rgba(63,63,70,.6);color:#a1a1aa;border:1px solid rgba(63,63,70,.4)}
    .cbar-wrap{margin-bottom:16px}
    .criteria-bar{height:4px;background:#27272a;border-radius:2px;overflow:hidden;margin-bottom:4px;display:inline-block;width:120px}
    .criteria-fill{height:100%;border-radius:2px}
    .criteria-label{font-size:10px;color:#71717a}
    .ds{border-top:1px solid #27272a;padding-top:20px;margin-bottom:24px}
    .ds-title{font-size:12px;font-weight:700;letter-spacing:.06em;color:#71717a;text-transform:uppercase;margin-bottom:10px}
    .ds-body{font-size:14px;color:#d4d4d8;line-height:1.7;font-family:inherit}
    .ds-hist h2{font-size:12px;font-weight:700;letter-spacing:.06em;color:#71717a;text-transform:uppercase;margin-bottom:10px}
    .ds-hist ul{list-style:none;display:flex;flex-direction:column;gap:6px;border-top:1px solid #27272a;padding-top:20px;margin-bottom:24px}
    .ds-hcol{display:inline-block;font-size:11px;font-weight:600;padding:1px 8px;border-radius:4px;background:#27272a;color:#a1a1aa;font-family:monospace}
    .ds-hdate{font-size:11px;color:#52525b}
    .ts{font-size:11px;color:#3f3f46;margin-top:8px}
    .footer{margin-top:28px;font-size:11px;color:#3f3f46;text-align:center}
  </style></head><body><div class="wrap">
  <nav class="crumb">${breadcrumbBase}<span class="crumb-sep">›</span><span>${escHtml(card.title)}</span></nav>
  <div class="card-id">${escHtml(card.id)}</div>
  <h1 class="card-title">${escHtml(card.title)}</h1>
  <div class="meta-row">
    <span class="col-badge ${style.badge}">${style.label}</span>
    <span class="prio"><span class="prio-dot" style="background:${priorityColor}"></span>${escHtml(card.priority)}</span>
    ${tagsHtml ? `<span>${tagsHtml}</span>` : ""}
  </div>
  ${pbar ? `<div class="cbar-wrap">${pbar}</div>` : ""}
  <div class="ts">Created ${fmtDate(card.created_at)} · Updated ${fmtDate(card.updated_at)}</div>
  ${sectionsHtml || "<p style='color:#52525b;font-size:13px;margin-top:20px'>No content yet.</p>"}
  <div class="ds-hist"><h2>History</h2><ul>${historyHtml || "<li style='color:#3f3f46'>none</li>"}</ul></div>
  <footer class="footer">Brain Board · <a href="/board" style="color:#52525b">← board</a>${project ? ` · <a href="/board/${escHtml(project.id)}" style="color:#52525b">← ${escHtml(project.name)}</a>` : ""}</footer>
</div></body></html>`;
}

function renderCard(card, projectMap) {
  const { checked, total } = criteriaProgress(card.acceptance_criteria);
  const showProgress = card.column === "in-progress" || card.column === "in-review";
  const priorityColor = PRIORITY_COLORS[card.priority] ?? PRIORITY_COLORS.low;
  const tagsHtml = card.tags.length > 0
    ? `<div class="card-tags">${card.tags.map(t => `<span class="tag">${escHtml(t)}</span>`).join("")}</div>`
    : "";
  const problemPreview = card.problem_description
    ? `<p class="card-preview">${escHtml(card.problem_description.split("\n")[0]?.slice(0, 100) ?? "")}</p>`
    : "";
  const projectName = card.project_id ? projectMap.get(card.project_id) : undefined;
  const projectBadge = projectName
    ? `<a class="project-badge" href="/board/${escHtml(card.project_id)}" onclick="event.stopPropagation()">${escHtml(projectName)}</a>`
    : "";

  return `<div class="card" data-id="${escHtml(card.id)}" onclick="openCard('${escHtml(card.id)}')">
    <div class="card-header">
      <span class="card-id">${escHtml(card.id)}</span>
      <span class="priority-dot" style="background:${priorityColor}" title="${card.priority}"></span>
    </div>
    <div class="card-title">${escHtml(card.title)}</div>
    ${problemPreview}${projectBadge}${tagsHtml}
    ${showProgress ? progressBar(checked, total) : ""}
    <div class="card-meta">updated ${fmtDate(card.updated_at)}</div>
  </div>`;
}

function renderColumn(col, cards, projectMap) {
  const style = COLUMN_STYLES[col];
  const colCards = cards.filter(c => c.column === col);
  return `<div class="column">
    <div class="column-header">
      <span class="column-badge ${style.badge}">${style.label}</span>
      <span class="column-count">${colCards.length}</span>
    </div>
    <div class="column-cards">
      ${colCards.length === 0
        ? `<div class="column-empty">empty</div>`
        : colCards.slice(0, 10).map(c => renderCard(c, projectMap)).join("")}
    </div>
  </div>`;
}

function renderProjectDropdown(projects, selectedProjectId) {
  if (projects.length === 0) {
    return `<span class="filter-label" style="color:#3f3f46;font-style:italic">no projects yet</span>`;
  }
  const options = [
    `<option value="" ${selectedProjectId === "" ? "selected" : ""}>All projects</option>`,
    ...projects.map(p => {
      const archived = p.status === "archived" ? " (archived)" : "";
      const sel = selectedProjectId === p.id ? "selected" : "";
      return `<option value="${escHtml(p.id)}" ${sel}>${escHtml(p.name)}${archived}</option>`;
    }),
  ].join("");
  return `<div class="project-filter">
    <label class="filter-label" for="proj-sel">Project</label>
    <select id="proj-sel" name="project" onchange="window.location.href=this.value?'/board/'+this.value:'/board'" class="filter-select">
      ${options}
    </select>
    ${selectedProjectId ? `<a class="filter-clear" href="/board">✕</a>` : ""}
  </div>`;
}

function renderPage(cards, projects, selectedProjectId, refreshedAt) {
  const projectMap = new Map(projects.map(p => [p.id, p.name]));
  const nBacklog    = cards.filter(c => c.column === "backlog").length;
  const nInProgress = cards.filter(c => c.column === "in-progress").length;
  const nInReview   = cards.filter(c => c.column === "in-review").length;
  const nShipped    = cards.filter(c => c.column === "shipped").length;
  const nProjects   = projects.length;
  const activeCols  = ["backlog","in-progress","in-review"].map(col => renderColumn(col, cards, projectMap)).join("");
  const shippedCards = cards.filter(c => c.column === "shipped");
  const shippedCardsHtml = shippedCards.length === 0
    ? `<div class="column-empty">empty</div>`
    : shippedCards.map(c => renderCard(c, projectMap)).join("");
  const cardsJson   = JSON.stringify(cards).replace(/<\/script>/gi, "<\\/script>");
  const projectsJson = JSON.stringify(projects).replace(/<\/script>/gi, "<\\/script>");
  const selectedProject = selectedProjectId ? projects.find(p => p.id === selectedProjectId) : undefined;
  const titleSuffix = selectedProject ? ` — ${escHtml(selectedProject.name)}` : "";

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="board-project" content="${escHtml(selectedProjectId)}">
  <title>MiniClaw Brain${titleSuffix}</title>
  <style>
    *,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
    body{background:#09090b;color:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,monospace;height:100vh;overflow:hidden;padding:20px 24px;display:flex;flex-direction:column;box-sizing:border-box}

    /* ---- Top bar (unified across all tabs) ---- */
    .top-bar{display:flex;align-items:stretch;gap:0;border-bottom:1px solid #27272a;margin-bottom:20px;min-height:44px}
    .header-brand{font-size:17px;font-weight:700;color:#fafafa;letter-spacing:-.5px;padding:0 16px 0 0;display:flex;align-items:center;white-space:nowrap;border-right:1px solid #27272a;margin-right:4px}
    .tab-bar{display:flex;align-items:stretch;gap:0;flex:0 0 auto}
    .tab-btn{background:none;border:none;border-bottom:2px solid transparent;color:#71717a;font-size:13px;font-weight:500;padding:0 18px;cursor:pointer;transition:color .15s,border-color .15s;font-family:inherit;margin-bottom:-1px;white-space:nowrap}
    .tab-btn:hover{color:#a1a1aa}
    .tab-btn.active{color:#fafafa;border-bottom-color:#fafafa}
    .board-controls{flex:1;display:flex;align-items:center;justify-content:center;gap:8px;padding:0 10px}
    .board-controls.hidden{display:none!important}
    .stat-pills{display:flex;align-items:center}
    .stat-pill{font-size:11px;color:#52525b;padding:0 12px;border-left:1px solid #27272a;white-space:nowrap;display:flex;align-items:center;height:100%}
    .stat-pill b{color:#a1a1aa;font-weight:600;margin-left:4px}

    /* ---- Project filter ---- */
    .filter-label{font-size:11px;color:#71717a;white-space:nowrap}
    .filter-select{background:#18181b;color:#e4e4e7;border:1px solid #3f3f46;border-radius:6px;padding:3px 24px 3px 8px;font-size:12px;cursor:pointer;appearance:none;-webkit-appearance:none;background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='10' viewBox='0 0 24 24' fill='none' stroke='%2371717a' stroke-width='2'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E");background-repeat:no-repeat;background-position:right 6px center;min-width:120px}
    .filter-select:focus{outline:none;border-color:#52525b}
    .filter-clear{color:#52525b;text-decoration:none;font-size:12px;padding:2px 4px;border-radius:4px}
    .filter-clear:hover{color:#a1a1aa;background:#27272a}

    /* ---- Board ---- */
    .tab-panel{display:none;flex:1;overflow-y:auto}
    .board{display:flex;gap:12px;align-items:stretch}
    .column{flex:1 1 0;min-width:0;background:rgba(39,39,42,.6);border:1px solid rgba(63,63,70,.5);border-radius:12px;padding:16px;display:flex;flex-direction:column;min-height:0;overflow:hidden}
    .column-header{display:flex;align-items:center;justify-content:space-between;margin-bottom:14px;flex-shrink:0}
    .column-badge{font-size:11px;font-weight:700;letter-spacing:.08em;padding:3px 10px;border-radius:9999px}
    .bg-zinc-600{background:#52525b}.text-zinc-100{color:#f4f4f5}
    .bg-blue-600{background:#2563eb}.text-blue-50{color:#eff6ff}
    .bg-amber-500{background:#f59e0b}.text-amber-950{color:#451a03}
    .bg-green-600{background:#16a34a}.text-green-50{color:#f0fdf4}
    .column-count{font-size:13px;color:#71717a;font-weight:500}
    .column-empty{text-align:center;color:#3f3f46;font-size:13px;padding:24px 0;font-style:italic}
    .column-cards{display:flex;flex-direction:column;gap:10px;overflow-y:auto;flex:1;min-height:0}

    /* ---- Shipped sidebar ---- */
    .shipped-col{flex:0 0 36px!important;min-width:36px;overflow:hidden;cursor:pointer;transition:flex .25s ease;padding:0;display:flex;flex-direction:column;align-items:center;justify-content:center}
    .shipped-col.open{flex:1 1 0!important;min-width:0;padding:16px;cursor:default;display:block}
    .shipped-label{writing-mode:vertical-rl;transform:rotate(180deg);font-size:11px;font-weight:700;letter-spacing:.12em;color:#52525b;white-space:nowrap;user-select:none;text-transform:uppercase}
    .shipped-col .column-header,.shipped-col .column-cards{display:none}
    .shipped-col.open .shipped-label{display:none}
    .shipped-col.open .column-header,.shipped-col.open .column-cards{display:flex}
    .shipped-col.open .column-cards{flex-direction:column;gap:10px}
    .shipped-col:not(.open):hover .shipped-label{color:#a1a1aa}

    /* ---- Cards ---- */
    .card{background:rgba(24,24,27,.7);border:1px solid rgba(63,63,70,.4);border-radius:8px;padding:12px;transition:border-color .15s;cursor:pointer}
    .card:hover{border-color:rgba(113,113,122,.6);background:rgba(39,39,42,.8)}
    .card-header{display:flex;align-items:center;justify-content:space-between;margin-bottom:6px}
    .card-id{font-size:10px;color:#52525b;font-family:monospace;letter-spacing:.03em}
    .priority-dot{width:8px;height:8px;border-radius:50%;flex-shrink:0}
    .card-title{font-size:14px;font-weight:500;color:#e4e4e7;line-height:1.4;margin-bottom:6px}
    .card-preview{font-size:12px;color:#71717a;line-height:1.4;margin-bottom:8px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
    .project-badge{display:inline-block;font-size:10px;padding:1px 7px;border-radius:4px;background:rgba(37,99,235,.15);color:#93c5fd;border:1px solid rgba(37,99,235,.3);margin-bottom:7px;text-decoration:none}
    .project-badge:hover{background:rgba(37,99,235,.25);border-color:rgba(37,99,235,.5)}
    .card-tags{display:flex;flex-wrap:wrap;gap:4px;margin-bottom:8px}
    .tag{font-size:10px;padding:1px 6px;border-radius:4px;background:rgba(63,63,70,.6);color:#a1a1aa;border:1px solid rgba(63,63,70,.4)}
    .criteria-bar{height:4px;background:#27272a;border-radius:2px;overflow:hidden;margin-bottom:4px}
    .criteria-fill{height:100%;border-radius:2px;transition:width .3s ease}
    .criteria-label{font-size:10px;color:#71717a}
    .card-meta{font-size:10px;color:#3f3f46;margin-top:8px}
    .footer{margin-top:20px;font-size:11px;color:#3f3f46;text-align:center}

    /* ---- Memory tab ---- */
    .mem-layout{display:grid;grid-template-columns:1fr 1fr;gap:20px;align-items:start}
    @media(max-width:900px){.mem-layout{grid-template-columns:1fr}}
    .mem-col-header{font-size:12px;font-weight:700;color:#71717a;letter-spacing:.06em;margin-bottom:10px;text-transform:uppercase}
    .mem-search{width:100%;background:#18181b;border:1px solid #3f3f46;border-radius:6px;color:#e4e4e7;font-size:13px;padding:7px 12px;margin-bottom:10px;font-family:inherit;outline:none;transition:border-color .15s}
    .mem-search:focus{border-color:#52525b}
    .mem-search::placeholder{color:#3f3f46}
    .mem-list{display:flex;flex-direction:column;gap:8px;min-height:60px}
    .mem-card{background:rgba(24,24,27,.7);border:1px solid rgba(63,63,70,.4);border-radius:8px;padding:11px;cursor:pointer;transition:border-color .15s}
    .mem-card:hover{border-color:rgba(113,113,122,.6);background:rgba(39,39,42,.8)}
    .mem-card-top{display:flex;align-items:center;gap:7px;margin-bottom:4px}
    .mem-card-title{font-size:13px;font-weight:500;color:#e4e4e7;flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
    .mem-card-snippet{font-size:11px;color:#71717a;line-height:1.5;overflow:hidden;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical}
    .mem-card-meta{font-size:10px;color:#3f3f46;margin-top:5px}
    .type-badge{font-size:10px;padding:1px 6px;border-radius:4px;flex-shrink:0;font-weight:600;letter-spacing:.04em}
    .type-error{background:rgba(220,38,38,.15);color:#fca5a5;border:1px solid rgba(220,38,38,.3)}
    .type-guide{background:rgba(37,99,235,.15);color:#93c5fd;border:1px solid rgba(37,99,235,.3)}
    .type-note{background:rgba(63,63,70,.4);color:#a1a1aa;border:1px solid rgba(63,63,70,.4)}
    .type-other{background:rgba(139,92,246,.15);color:#c4b5fd;border:1px solid rgba(139,92,246,.3)}
    .coll-badge{font-size:10px;padding:1px 6px;border-radius:4px;background:rgba(245,158,11,.1);color:#fcd34d;border:1px solid rgba(245,158,11,.2);flex-shrink:0;max-width:110px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
    .score-badge{font-size:10px;color:#52525b;flex-shrink:0}
    .mem-empty{color:#3f3f46;font-size:13px;font-style:italic;padding:20px 0;text-align:center}
    .mem-loading{color:#52525b;font-size:13px;font-style:italic;padding:20px 0;text-align:center}

    /* ---- Board viewport lock ---- */
    #tab-board{flex:1;overflow:hidden}
    .board{flex:1;min-height:0;overflow:hidden}
    .shipped-col{overflow:hidden}
    .shipped-col.open{overflow-y:auto}

    /* ---- Cron tab ---- */
    .cron-list{overflow-y:auto}
    /* Legacy card styles (used in modal) */
    .cron-card{background:rgba(24,24,27,.7);border:1px solid rgba(63,63,70,.4);border-radius:8px;padding:14px;cursor:pointer;transition:border-color .15s}
    .cron-card:hover{border-color:rgba(113,113,122,.6);background:rgba(39,39,42,.8)}
    .cron-card-top{display:flex;align-items:center;gap:10px;margin-bottom:8px;flex-wrap:wrap}
    .cron-name{font-size:14px;font-weight:600;color:#e4e4e7;flex:1;min-width:0}
    .enabled-dot{width:7px;height:7px;border-radius:50%;flex-shrink:0}
    .enabled-dot.on{background:#16a34a}
    .enabled-dot.off{background:#52525b}
    .status-badge{font-size:10px;font-weight:700;padding:2px 8px;border-radius:9999px;letter-spacing:.05em;flex-shrink:0}
    .status-ok{background:rgba(22,163,74,.15);color:#86efac;border:1px solid rgba(22,163,74,.3)}
    .status-error{background:rgba(220,38,38,.15);color:#fca5a5;border:1px solid rgba(220,38,38,.3)}
    .status-timeout{background:rgba(245,158,11,.15);color:#fcd34d;border:1px solid rgba(245,158,11,.3)}
    .status-unknown{background:rgba(63,63,70,.4);color:#71717a;border:1px solid rgba(63,63,70,.4)}
    .cron-meta-row{display:flex;gap:16px;flex-wrap:wrap;font-size:11px;color:#71717a;margin-bottom:6px}
    .cron-meta-item{display:flex;align-items:center;gap:5px}
    .cron-meta-label{color:#3f3f46}
    .cron-summary{font-size:12px;color:#71717a;line-height:1.5;overflow:hidden;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical}
    .cron-schedule{font-size:11px;color:#52525b;font-family:monospace}

    /* ---- Timeline ---- */
    .tl-container{background:rgba(9,9,11,.3);border:1px solid rgba(63,63,70,.4);border-radius:12px;overflow:hidden}
    .tl-axis{position:relative;height:28px;border-bottom:1px solid #27272a;margin-left:220px}
    .tl-hour-label{position:absolute;transform:translateX(-50%);font-size:10px;color:#3f3f46;top:8px;white-space:nowrap;pointer-events:none}
    .tl-now-label{color:#ef4444!important;font-weight:700}
    .tl-body{position:relative}
    .tl-row{display:flex;align-items:stretch;height:32px;border-bottom:1px solid rgba(39,39,42,.5);cursor:pointer;transition:background .1s}
    .tl-row:hover{background:rgba(39,39,42,.4)}
    .tl-row:last-child{border-bottom:none}
    .tl-job-meta{width:220px;min-width:220px;display:flex;align-items:center;gap:6px;padding:0 10px;border-right:1px solid rgba(39,39,42,.6);flex-shrink:0;overflow:hidden}
    .tl-enabled-dot{width:6px;height:6px;border-radius:50%;flex-shrink:0}
    .tl-job-name{font-size:11px;color:#e4e4e7;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;flex:1}
    .tl-track{flex:1;position:relative;height:100%;overflow:visible}
    .tl-dot{position:absolute;width:7px;height:7px;border-radius:50%;top:50%;transform:translate(-50%,-50%);z-index:2;transition:transform .1s}
    .tl-row:hover .tl-dot{transform:translate(-50%,-50%) scale(1.5)}
    .tl-dot-past{background:#3f3f46;border:1px solid #52525b}
    .tl-dot-future{background:#3b82f6}
    .tl-dot-next{background:#f59e0b;width:9px;height:9px;box-shadow:0 0 5px rgba(245,158,11,.6)}
    .tl-dot-ok{background:#16a34a}
    .tl-dot-error{background:#dc2626}
    .tl-dot-timeout{background:#f59e0b}
    .tl-now-line{position:absolute;top:0;bottom:0;left:50%;width:1px;background:#ef4444;opacity:.5;pointer-events:none;z-index:1}
    .tl-highfreq{position:absolute;top:50%;height:3px;transform:translateY(-50%);border-radius:2px}
    .tl-edge-label{position:absolute;top:50%;transform:translateY(-50%);font-size:9px;color:#3f3f46;pointer-events:none}
    .tl-freq-label{position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);font-size:9px;color:#52525b;white-space:nowrap;pointer-events:none}

    /* ---- Modals ---- */
    .modal-backdrop{position:fixed;inset:0;background:#09090b;z-index:100;opacity:0;pointer-events:none;transition:opacity .1s;overflow-y:auto}
    .modal-backdrop.open{opacity:1;pointer-events:all}
    .modal{width:100%;min-height:100%;max-width:900px;margin:0 auto;padding:40px 48px;position:relative;transform:translateY(8px);transition:transform .1s}
    .modal-backdrop.open .modal{transform:translateY(0)}
    .modal-close{position:absolute;top:16px;right:16px;background:none;border:none;color:#52525b;font-size:20px;cursor:pointer;line-height:1;padding:4px 8px;border-radius:6px}
    .modal-close:hover{background:rgba(63,63,70,.4);color:#a1a1aa}
    .modal-top{display:flex;align-items:center;gap:10px;margin-bottom:6px;flex-wrap:wrap}
    .modal-id{font-size:11px;color:#52525b;font-family:monospace}
    .modal-col-badge{font-size:11px;font-weight:700;letter-spacing:.06em;padding:2px 8px;border-radius:9999px}
    .modal-priority{font-size:11px;padding:2px 8px;border-radius:9999px;border:1px solid currentColor}
    .modal-project-badge{font-size:11px;padding:2px 9px;border-radius:4px;background:rgba(37,99,235,.15);color:#93c5fd;border:1px solid rgba(37,99,235,.3);text-decoration:none}
    .modal-project-badge:hover{background:rgba(37,99,235,.25)}
    .modal-permalink{font-size:11px;padding:2px 7px;border-radius:4px;color:#52525b;text-decoration:none;border:1px solid #27272a;margin-left:auto}
    .modal-permalink:hover{color:#a1a1aa;border-color:#3f3f46}
    .priority-high{color:#ef4444;border-color:#ef4444}
    .priority-medium{color:#f97316;border-color:#f97316}
    .priority-low{color:#71717a;border-color:#52525b}
    .modal-title{font-size:22px;font-weight:700;color:#fafafa;line-height:1.3;margin-bottom:12px}
    .modal-tags{display:flex;flex-wrap:wrap;gap:6px;margin-bottom:20px}
    .modal-section{margin-bottom:20px}
    .modal-section-label{font-size:10px;font-weight:700;letter-spacing:.1em;color:#52525b;text-transform:uppercase;margin-bottom:8px}
    .modal-section-body{font-size:13px;color:#a1a1aa;line-height:1.7;white-space:pre-wrap;display:flex;flex-direction:column;gap:4px}
    .content-line{display:block}
    .check-item{display:flex;align-items:baseline;gap:8px;color:#a1a1aa;cursor:default}
    .check-item.checked{color:#71717a;text-decoration:line-through}
    .check-item input{flex-shrink:0;accent-color:#3b82f6;cursor:default}
    .modal-history{display:flex;flex-direction:column;gap:6px}
    .history-row{display:flex;align-items:center;gap:10px;font-size:12px;color:#52525b}
    .history-col{color:#a1a1aa;font-weight:500}
    .modal-divider{border:none;border-top:1px solid rgba(63,63,70,.4);margin:20px 0}
    .cron-run-list{display:flex;flex-direction:column;gap:10px}
    .cron-run-item{background:rgba(24,24,27,.5);border:1px solid rgba(63,63,70,.3);border-radius:6px;padding:10px 14px}
    .cron-run-header{display:flex;align-items:center;gap:10px;margin-bottom:6px}
    .cron-run-body{font-size:12px;color:#71717a;line-height:1.6;white-space:pre-wrap;max-height:300px;overflow-y:auto}
  </style>
</head>
<body>
  <!-- Unified top bar — same across all tabs -->
  <div class="top-bar">
    <span class="header-brand">MiniClaw Brain</span>
    <nav class="tab-bar">
      <button class="tab-btn active" onclick="switchTab('board')">Board</button>
      <button class="tab-btn" onclick="switchTab('memory')">Memory</button>
      <button class="tab-btn" onclick="switchTab('cron')">Scheduling</button>
    </nav>
    <div class="board-controls" id="board-controls">
      ${renderProjectDropdown(projects, selectedProjectId)}
    </div>
    <div class="stat-pills">
      <span class="stat-pill">projects<b id="stat-projects">${nProjects}</b></span>
      <span class="stat-pill">backlog<b id="stat-backlog">${nBacklog}</b></span>
      <span class="stat-pill">in&nbsp;progress<b id="stat-inprogress">${nInProgress}</b></span>
      <span class="stat-pill">in&nbsp;review<b id="stat-inreview">${nInReview}</b></span>
      <span class="stat-pill">shipped<b id="stat-shipped">${nShipped}</b></span>
    </div>
  </div>

  <!-- Board tab -->
  <div class="tab-panel" id="tab-board" style="display:flex;flex-direction:column">
    <div id="active-agents-bar" style="display:none;background:#18181b;border-bottom:1px solid #27272a;padding:8px 20px;font-size:12px;color:#a1a1aa;gap:16px;flex-wrap:wrap"></div>
    <div class="board">
      ${activeCols}
      <div class="column shipped-col" id="shipped-col" onclick="toggleShipped(event)">
        <div class="shipped-label">Shipped&nbsp;(${nShipped})</div>
        <div class="column-header">
          <span class="column-badge bg-green-600 text-green-50">SHIPPED</span>
          <span class="column-count" id="shipped-count">${nShipped}</span>
        </div>
        <div class="column-cards" id="shipped-cards">${shippedCardsHtml}</div>
      </div>
    </div>
  </div>

  <!-- Memory tab -->
  <div class="tab-panel" id="tab-memory" style="display:none">
    <div class="mem-layout">
      <div>
        <div class="mem-col-header" id="kb-col-header">Long-term (KB)</div>
        <input class="mem-search" id="kb-search" type="text" placeholder="Search knowledge base..." oninput="debouncedKbSearch(this.value)">
        <div class="mem-list" id="kb-list"><div class="mem-loading">Loading...</div></div>
      </div>
      <div>
        <div class="mem-col-header" id="qmd-col-header">Short-term (QMD)</div>
        <input class="mem-search" id="qmd-search" type="text" placeholder="Search memory notes..." oninput="debouncedQmdSearch(this.value)">
        <div class="mem-list" id="qmd-list"><div class="mem-empty">Type to search</div></div>
      </div>
    </div>
  </div>

  <!-- Cron tab -->
  <div class="tab-panel" id="tab-cron" style="display:none">
    <div class="cron-list" id="cron-list"><div class="mem-loading">Loading...</div></div>
  </div>

  <footer class="footer" id="footer">Last updated: ${refreshedAt.toISOString()} · port 4220</footer>

  <!-- Board card modal -->
  <div class="modal-backdrop" id="backdrop">
    <div class="modal" id="modal">
      <button class="modal-close" onclick="closeModal('backdrop')">✕</button>
      <div id="modal-content"></div>
    </div>
  </div>

  <!-- KB/QMD entry modal -->
  <div class="modal-backdrop" id="kb-backdrop">
    <div class="modal" id="kb-modal">
      <button class="modal-close" onclick="closeModal('kb-backdrop')">✕</button>
      <div id="kb-modal-content"></div>
    </div>
  </div>

  <!-- Cron job modal -->
  <div class="modal-backdrop" id="cron-backdrop">
    <div class="modal" id="cron-modal">
      <button class="modal-close" onclick="closeModal('cron-backdrop')">✕</button>
      <div id="cron-modal-content"></div>
    </div>
  </div>

  <script>
    const CARDS = ${cardsJson};
    const PROJECTS = ${projectsJson};
    const PROJECT_MAP = Object.fromEntries(PROJECTS.map(p => [p.id, p.name]));
    const COLUMN_STYLES = {
      "backlog":     { badge: "bg-zinc-600 text-zinc-100", label: "BACKLOG" },
      "in-progress": { badge: "bg-blue-600 text-blue-50",  label: "IN PROGRESS" },
      "in-review":   { badge: "bg-amber-500 text-amber-950", label: "IN REVIEW" },
      "shipped":     { badge: "bg-green-600 text-green-50", label: "SHIPPED" },
    };

    // ==================== TAB SWITCHING ====================
    const TABS = ["board", "memory", "cron"];
    const tabLoaded = { board: true, memory: false, cron: false };
    let boardPollInterval = null;
    let memRefreshInterval = null;
    let cronRefreshInterval = null;

    function showTab(tab) {
      // Buttons
      document.querySelectorAll(".tab-btn").forEach((b, i) => {
        b.classList.toggle("active", TABS[i] === tab);
      });
      // Panels — direct style, no class dependency
      TABS.forEach(t => {
        const el = document.getElementById("tab-" + t);
        if (!el) return;
        if (t !== tab) { el.style.display = "none"; return; }
        el.style.display = (t === "board") ? "flex" : "block";
        if (t === "board") el.style.flexDirection = "column";
      });
      // Board controls: keep cell in layout, just hide content
      const bc = document.getElementById("board-controls");
      if (bc) bc.style.visibility = (tab === "board") ? "visible" : "hidden";
      // URL — real paths, no hash
      const TAB_PATHS = { board: "/board", memory: "/memory", cron: "/scheduling" };
      try { history.replaceState(null, "", TAB_PATHS[tab] || "/" + tab); } catch {}
    }

    function switchTab(tab) {
      showTab(tab);
      if (tab === "board") {
        if (!boardPollInterval) boardPollInterval = setInterval(pollBoard, 10000);
      } else {
        if (boardPollInterval) { clearInterval(boardPollInterval); boardPollInterval = null; }
      }
      if (tab === "memory") {
        if (!tabLoaded.memory) { loadKbList(); loadQmdRecent(); tabLoaded.memory = true; }
        if (!memRefreshInterval) memRefreshInterval = setInterval(() => { loadKbList(); loadQmdRecent(); }, 30000);
      } else {
        if (memRefreshInterval) { clearInterval(memRefreshInterval); memRefreshInterval = null; }
      }
      if (tab === "cron") {
        if (!tabLoaded.cron) { loadCron(); tabLoaded.cron = true; }
        if (!cronRefreshInterval) cronRefreshInterval = setInterval(loadCron, 30000);
      } else {
        if (cronRefreshInterval) { clearInterval(cronRefreshInterval); cronRefreshInterval = null; }
      }
    }

    // Init: respect URL path or default to board
    const _pathSeg = location.pathname.split("/").filter(Boolean)[0] ?? "";
    const initTab = _pathSeg === "memory" ? "memory" : _pathSeg === "scheduling" ? "cron" : "board";
    showTab(initTab);
    if (initTab === "board") {
      boardPollInterval = setInterval(pollBoard, 10000);
    } else {
      switchTab(initTab);
    }

    // ==================== SHIPPED SIDEBAR ====================
    let shippedOpen = false;
    function toggleShipped(e) {
      const col = document.getElementById("shipped-col");
      if (!col) return;
      shippedOpen = !shippedOpen;
      col.classList.toggle("open", shippedOpen);
      if (shippedOpen && e) e.stopPropagation();
    }

    // ==================== SHARED HELPERS ====================
    function escHtml(s) {
      return String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#39;");
    }
    function fmtDate(iso) {
      try {
        const diff = Date.now() - new Date(iso).getTime();
        if (diff < 60000) return "just now";
        if (diff < 3600000) return Math.floor(diff/60000) + "m ago";
        if (diff < 86400000) return Math.floor(diff/3600000) + "h ago";
        return Math.floor(diff/86400000) + "d ago";
      } catch { return String(iso); }
    }
    function fmtMs(ms) {
      if (!ms) return "";
      const diff = Date.now() - ms;
      if (diff < 60000) return "just now";
      if (diff < 3600000) return Math.floor(diff/60000) + "m ago";
      if (diff < 86400000) return Math.floor(diff/3600000) + "h ago";
      return Math.floor(diff/86400000) + "d ago";
    }
    function fmtUntilMs(ms) {
      if (!ms) return "";
      const diff = ms - Date.now();
      if (diff <= 0) return "now";
      if (diff < 60000) return "in " + Math.ceil(diff/1000) + "s";
      if (diff < 3600000) return "in " + Math.floor(diff/60000) + "m";
      if (diff < 86400000) return "in " + Math.floor(diff/3600000) + "h";
      return "in " + Math.floor(diff/86400000) + "d";
    }
    function fmtDuration(ms) {
      if (!ms) return "";
      if (ms < 1000) return ms + "ms";
      if (ms < 60000) return (ms/1000).toFixed(1) + "s";
      return Math.floor(ms/60000) + "m " + Math.floor((ms%60000)/1000) + "s";
    }

    function openModal(backdropId) {
      document.getElementById(backdropId).classList.add("open");
      document.getElementById(backdropId.replace("-backdrop", "-modal") || "modal").scrollTop = 0;
    }
    function closeModal(backdropId) {
      document.getElementById(backdropId).classList.remove("open");
      if (backdropId === "backdrop" && pendingData) { applyBoardData(pendingData); pendingData = null; }
    }

    document.addEventListener("keydown", e => {
      if (e.key === "Escape") {
        ["backdrop","kb-backdrop","cron-backdrop"].forEach(id => {
          const el = document.getElementById(id);
          if (el && el.classList.contains("open")) closeModal(id);
        });
      }
    });

    // ==================== BOARD ====================
    const BOARD_PROJECT = document.querySelector('meta[name="board-project"]')?.content ?? "";

    function renderSectionBody(content) {
      if (!content || !content.trim()) return '<span style="color:#3f3f46;font-style:italic">empty</span>';
      return content.split("\\n").map(line => {
        const unc = line.match(/^- \\[ \\] (.+)/);
        const chk = line.match(/^- \\[x\\] (.+)/);
        if (unc) return '<label class="check-item"><input type="checkbox" disabled> ' + escHtml(unc[1]) + '</label>';
        if (chk) return '<label class="check-item checked"><input type="checkbox" checked disabled> ' + escHtml(chk[1]) + '</label>';
        return '<span class="content-line">' + escHtml(line) + '</span>';
      }).join("\\n");
    }

    function openCard(id) {
      const card = CARDS.find(c => c.id === id);
      if (!card) return;
      const style = COLUMN_STYLES[card.column] || COLUMN_STYLES.backlog;
      const tagsHtml = card.tags.length
        ? card.tags.map(t => '<span class="tag">' + escHtml(t) + '</span>').join("")
        : "";
      const projectName = card.project_id ? PROJECT_MAP[card.project_id] : null;
      const projectBadge = projectName
        ? '<a class="modal-project-badge" href="/board/' + escHtml(card.project_id) + '">' + escHtml(projectName) + '</a>'
        : "";
      const permalink = card.project_id
        ? '<a class="modal-permalink" href="/board/' + escHtml(card.project_id) + '/' + escHtml(card.id) + '" title="Permalink">🔗 permalink</a>'
        : "";
      const historyHtml = (card.history || []).map(h =>
        '<div class="history-row"><span class="history-col">' + escHtml(h.column) + '</span><span>' + escHtml(h.moved_at) + '</span></div>'
      ).join("");

      document.getElementById("modal-content").innerHTML =
        '<div class="modal-top">' +
          '<span class="modal-id">' + escHtml(card.id) + '</span>' +
          '<span class="modal-col-badge ' + style.badge + '">' + style.label + '</span>' +
          '<span class="modal-priority priority-' + escHtml(card.priority) + '">' + escHtml(card.priority) + '</span>' +
          projectBadge +
          permalink +
        '</div>' +
        '<div class="modal-title">' + escHtml(card.title) + '</div>' +
        (tagsHtml ? '<div class="modal-tags">' + tagsHtml + '</div>' : '') +
        '<hr class="modal-divider">' +
        '<div class="modal-section"><div class="modal-section-label">Problem Description</div><div class="modal-section-body">' + renderSectionBody(card.problem_description) + '</div></div>' +
        '<div class="modal-section"><div class="modal-section-label">Implementation Plan</div><div class="modal-section-body">' + renderSectionBody(card.implementation_plan) + '</div></div>' +
        '<div class="modal-section"><div class="modal-section-label">Acceptance Criteria</div><div class="modal-section-body">' + renderSectionBody(card.acceptance_criteria) + '</div></div>' +
        (card.notes && card.notes.trim() ? '<div class="modal-section"><div class="modal-section-label">Notes / Outcome</div><div class="modal-section-body">' + renderSectionBody(card.notes) + '</div></div>' : '') +
        (card.review_notes && card.review_notes.trim() ? '<div class="modal-section"><div class="modal-section-label">Review Notes</div><div class="modal-section-body">' + renderSectionBody(card.review_notes) + '</div></div>' : '') +
        '<hr class="modal-divider">' +
        '<div class="modal-section"><div class="modal-section-label">History</div><div class="modal-history">' + (historyHtml || '<span style="color:#3f3f46">none</span>') + '</div></div>' +
        '<div style="font-size:11px;color:#3f3f46;margin-top:16px">created ' + escHtml(card.created_at) + ' · updated ' + escHtml(card.updated_at) + '</div>';

      document.getElementById("backdrop").classList.add("open");
      document.getElementById("modal").scrollTop = 0;
    }

    const PRIO_COLORS = { high: "#ef4444", medium: "#f97316", low: "#52525b" };
    const COL_STYLES = {
      "backlog":     { badge: "bg-zinc-600 text-zinc-100", label: "BACKLOG" },
      "in-progress": { badge: "bg-blue-600 text-blue-50",  label: "IN PROGRESS" },
      "in-review":   { badge: "bg-amber-500 text-amber-950", label: "IN REVIEW" },
      "shipped":     { badge: "bg-green-600 text-green-50", label: "SHIPPED" },
    };

    function buildCardHtml(card, projectMap) {
      const crit = card.acceptance_criteria ?? "";
      const total = (crit.match(/^- \\[[ x]\\]/gm) ?? []).length;
      const checked = (crit.match(/^- \\[x\\]/gm) ?? []).length;
      const showProg = card.column === "in-progress" || card.column === "in-review";
      const pct = total > 0 ? Math.round((checked / total) * 100) : 0;
      const progColor = pct === 100 ? "#22c55e" : pct >= 50 ? "#f97316" : "#3b82f6";
      const progHtml = showProg && total > 0
        ? '<div class="criteria-bar"><div class="criteria-fill" style="width:' + pct + '%;background:' + progColor + '"></div></div><span class="criteria-label">' + checked + "/" + total + " criteria</span>"
        : "";
      const tagsHtml = (card.tags ?? []).length > 0
        ? '<div class="card-tags">' + (card.tags).map(t => '<span class="tag">' + escHtml(t) + "</span>").join("") + "</div>" : "";
      const preview = card.problem_description
        ? '<p class="card-preview">' + escHtml((card.problem_description.split("\\n")[0] ?? "").slice(0, 100)) + "</p>" : "";
      const projName = card.project_id ? (projectMap || PROJECT_MAP)[card.project_id] : null;
      const projBadge = projName
        ? '<a class="project-badge" href="/board/' + escHtml(card.project_id) + '" onclick="event.stopPropagation()">' + escHtml(projName) + "</a>" : "";
      const prioColor = PRIO_COLORS[card.priority] ?? PRIO_COLORS.low;
      return '<div class="card" data-id="' + escHtml(card.id) + '" onclick="openCard(\\'' + escHtml(card.id) + '\\')">' +
        '<div class="card-header"><span class="card-id">' + escHtml(card.id) + '</span><span class="priority-dot" style="background:' + prioColor + '" title="' + escHtml(card.priority) + '"></span></div>' +
        '<div class="card-title">' + escHtml(card.title) + "</div>" +
        preview + projBadge + tagsHtml + progHtml +
        '<div class="card-meta">updated ' + fmtDate(card.updated_at) + "</div></div>";
    }

    function buildColHtml(col, cards, projectMap) {
      const s = COL_STYLES[col];
      const colCards = cards.filter(c => c.column === col);
      return '<div class="column">' +
        '<div class="column-header"><span class="column-badge ' + s.badge + '">' + s.label + '</span><span class="column-count">' + colCards.length + "</span></div>" +
        '<div class="column-cards">' + (colCards.length === 0 ? '<div class="column-empty">empty</div>' : colCards.slice(0, 10).map(c => buildCardHtml(c, projectMap)).join("")) + "</div>" +
        "</div>";
    }

    function updateStats(cards, projects) {
      const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
      set("stat-projects",   projects.length);
      set("stat-backlog",    cards.filter(c => c.column === "backlog").length);
      set("stat-inprogress", cards.filter(c => c.column === "in-progress").length);
      set("stat-inreview",   cards.filter(c => c.column === "in-review").length);
      set("stat-shipped",    cards.filter(c => c.column === "shipped").length);
    }

    function applyBoardData(data) {
      CARDS.length = 0; data.cards.forEach(c => CARDS.push(c));
      PROJECTS.length = 0; data.projects.forEach(p => PROJECTS.push(p));
      Object.keys(PROJECT_MAP).forEach(k => delete PROJECT_MAP[k]);
      data.projects.forEach(p => PROJECT_MAP[p.id] = p.name);

      const projectMap = Object.fromEntries(data.projects.map(p => [p.id, p.name]));
      const activeCols = ["backlog","in-progress","in-review"].map(col => buildColHtml(col, data.cards, projectMap)).join("");
      const shippedCards = data.cards.filter(c => c.column === "shipped");
      const shippedHtml = shippedCards.length === 0
        ? '<div class="column-empty">empty</div>'
        : shippedCards.map(c => buildCardHtml(c, projectMap)).join("");

      // Rebuild active columns (first 3 children of .board)
      const board = document.querySelector(".board");
      if (board) {
        // Replace first 3 column children
        const cols = board.querySelectorAll(".column:not(.shipped-col)");
        const tmpDiv = document.createElement("div");
        tmpDiv.innerHTML = activeCols;
        const newCols = tmpDiv.querySelectorAll(".column");
        cols.forEach((old, i) => { if (newCols[i]) board.replaceChild(newCols[i], old); });
      }

      // Update shipped sidebar content
      const sc = document.getElementById("shipped-cards");
      if (sc) sc.innerHTML = shippedHtml;
      const scount = document.getElementById("shipped-count");
      if (scount) scount.textContent = shippedCards.length;

      updateStats(data.cards, data.projects);
      document.getElementById("footer").textContent = "Last updated: " + new Date().toISOString() + " · port 4220";
    }

    let pendingData = null;
    async function pollBoard() {
      try {
        const qs = BOARD_PROJECT ? "?project=" + encodeURIComponent(BOARD_PROJECT) : "";
        const res = await fetch("/data" + qs);
        if (!res.ok) return;
        const data = await res.json();
        if (document.getElementById("backdrop").classList.contains("open")) {
          pendingData = data;
        } else {
          applyBoardData(data);
          pendingData = null;
        }
      } catch { /* network error — skip cycle */ }
    }

    // ==================== ACTIVE AGENTS ====================
    async function pollActiveAgents() {
      try {
        const res = await fetch("/data/active");
        if (!res.ok) return;
        const data = await res.json();
        const bar = document.getElementById("active-agents-bar");
        if (!bar) return;
        const entries = data.active || [];
        if (entries.length === 0) {
          bar.style.display = "none";
          return;
        }
        bar.style.display = "flex";
        bar.innerHTML = '<span style="color:#52525b;margin-right:4px">▶ active:</span>' +
          entries.map(e => {
            const age = Math.round((Date.now() - new Date(e.pickedUpAt).getTime()) / 1000);
            const ageStr = age < 60 ? age + "s" : Math.round(age / 60) + "m";
            return '<span style="background:#27272a;border-radius:4px;padding:2px 8px;margin-right:6px">' +
              '<span style="color:#71717a">' + escHtml(e.worker) + '</span>' +
              ' <span style="color:#e4e4e7">' + escHtml(e.cardId) + '</span>' +
              ' <span style="color:#a1a1aa">— ' + escHtml(e.title.slice(0, 40)) + (e.title.length > 40 ? "…" : "") + '</span>' +
              ' <span style="color:#52525b">(' + ageStr + ')</span>' +
              '</span>';
          }).join("");
      } catch { /* skip */ }
    }
    pollActiveAgents();
    setInterval(pollActiveAgents, 10000);

    // ==================== MEMORY / KB ====================
    let kbEntries = [];

    async function loadKbList(query) {
      const list = document.getElementById("kb-list");
      if (!list) return;
      if (query && query.trim()) {
        list.innerHTML = '<div class="mem-loading">Searching...</div>';
        try {
          const res = await fetch("/api/search/kb?q=" + encodeURIComponent(query.trim()));
          if (!res.ok) throw new Error("bad response");
          const data = await res.json();
          kbEntries = data.results ?? data;
        } catch {
          list.innerHTML = '<div class="mem-empty">Search failed</div>';
          return;
        }
      } else {
        if (kbEntries.length === 0) {
          list.innerHTML = '<div class="mem-loading">Loading...</div>';
          try {
            const res = await fetch("/data/kb");
            if (!res.ok) throw new Error("bad response");
            kbEntries = await res.json();
          } catch {
            list.innerHTML = '<div class="mem-empty">Failed to load KB</div>';
            return;
          }
        }
      }
      renderKbList(kbEntries);
    }

    function typeBadgeClass(type) {
      if (type === "error") return "type-error";
      if (type === "guide") return "type-guide";
      if (type === "note") return "type-note";
      return "type-other";
    }

    function renderKbList(entries) {
      const list = document.getElementById("kb-list");
      const hdr = document.getElementById("kb-col-header");
      if (hdr) hdr.textContent = "Long-term (KB)" + (entries && entries.length ? " (" + entries.length + ")" : "");
      if (!entries || entries.length === 0) {
        list.innerHTML = '<div class="mem-empty">No entries found</div>';
        return;
      }
      list.innerHTML = entries.slice(0, 10).map((e, i) => {
        const snippet = e.snippet || e.summary || e.body || "";
        const snipText = snippet.replace(/^@@.*@@\\n?/gm, "").trim().slice(0, 150);
        return '<div class="mem-card" onclick="openKbEntry(' + i + ')">' +
          '<div class="mem-card-top">' +
            '<span class="type-badge ' + typeBadgeClass(e.type || "note") + '">' + escHtml(e.type || "note") + '</span>' +
            '<span class="mem-card-title">' + escHtml(e.title || e.id || "Untitled") + '</span>' +
            (e.severity ? '<span class="score-badge">' + escHtml(e.severity) + '</span>' : '') +
          '</div>' +
          (snipText ? '<div class="mem-card-snippet">' + escHtml(snipText) + '</div>' : '') +
          '<div class="mem-card-meta">' + escHtml(e.updated_at || e.created_at || "") + '</div>' +
          '</div>';
      }).join("");
    }

    function openKbEntry(idx) {
      const e = kbEntries[idx];
      if (!e) return;
      const tagsHtml = (e.tags || []).map(t => '<span class="tag">' + escHtml(t) + '</span>').join("");
      document.getElementById("kb-modal-content").innerHTML =
        '<div class="modal-top">' +
          '<span class="type-badge ' + typeBadgeClass(e.type || "note") + '">' + escHtml(e.type || "note") + '</span>' +
          (e.severity ? '<span class="modal-id">' + escHtml(e.severity) + '</span>' : '') +
          (e.source ? '<span class="modal-id">src: ' + escHtml(e.source) + '</span>' : '') +
        '</div>' +
        '<div class="modal-title">' + escHtml(e.title || e.id || "Untitled") + '</div>' +
        (tagsHtml ? '<div class="modal-tags">' + tagsHtml + '</div>' : '') +
        '<hr class="modal-divider">' +
        (e.summary ? '<div class="modal-section"><div class="modal-section-label">Summary</div><div class="modal-section-body">' + escHtml(e.summary) + '</div></div>' : '') +
        (e.body ? '<div class="modal-section"><div class="modal-section-label">Content</div><div class="modal-section-body">' + escHtml(e.body) + '</div></div>' : '') +
        '<div style="font-size:11px;color:#3f3f46;margin-top:16px">created ' + escHtml(e.created_at || "") + ' · updated ' + escHtml(e.updated_at || "") + '</div>';
      document.getElementById("kb-backdrop").classList.add("open");
      document.getElementById("kb-modal").scrollTop = 0;
    }

    // QMD search + recent
    let qmdResults = [];
    async function loadQmdRecent() {
      const list = document.getElementById("qmd-list");
      if (!list) return;
      list.innerHTML = '<div class="mem-loading">Loading recent memories...</div>';
      try {
        const res = await fetch("/data/qmd");
        if (!res.ok) throw new Error("bad response");
        const data = await res.json();
        qmdResults = data;
        renderQmdList(qmdResults);
      } catch {
        list.innerHTML = '<div class="mem-empty">Failed to load memories</div>';
      }
    }
    async function loadQmdList(query) {
      const list = document.getElementById("qmd-list");
      if (!list) return;
      if (!query || !query.trim()) { loadQmdRecent(); return; }
      list.innerHTML = '<div class="mem-loading">Searching...</div>';
      try {
        const res = await fetch("/api/search/qmd?q=" + encodeURIComponent(query.trim()));
        if (!res.ok) throw new Error("bad response");
        const data = await res.json();
        qmdResults = data.results ?? data;
      } catch {
        list.innerHTML = '<div class="mem-empty">Search failed</div>';
        return;
      }
      renderQmdList(qmdResults);
    }

    function renderQmdList(results) {
      const list = document.getElementById("qmd-list");
      const hdr = document.getElementById("qmd-col-header");
      if (hdr) hdr.textContent = "Short-term (QMD)" + (results && results.length ? " (" + results.length + ")" : "");
      if (!results || results.length === 0) {
        list.innerHTML = '<div class="mem-empty">No results</div>';
        return;
      }
      list.innerHTML = results.slice(0, 10).map((r, i) => {
        // Handle both qmd search results (r.file = "qmd://coll/...") and plain file objects
        const isQmd = (r.file || "").startsWith("qmd://");
        const coll = isQmd
          ? (r.file || "").replace(/^qmd:\\/\\//, "").split("/")[0]
          : (r.collection || "");
        const snippet = isQmd
          ? (r.snippet || "").replace(/^@@.*@@\\n?/gm, "").replace(/@@ .* @@/g, "…").trim().slice(0, 200)
          : (r.snippet || "").slice(0, 200);
        return '<div class="mem-card" onclick="openQmdEntry(' + i + ')">' +
          '<div class="mem-card-top">' +
            (coll ? '<span class="coll-badge">' + escHtml(coll) + '</span>' : '') +
            '<span class="mem-card-title">' + escHtml(r.title || r.file || "Untitled") + '</span>' +
            (r.score != null ? '<span class="score-badge">' + Number(r.score).toFixed(2) + '</span>' : '') +
          '</div>' +
          (snippet ? '<div class="mem-card-snippet">' + escHtml(snippet) + '</div>' : '') +
          '<div class="mem-card-meta">' + escHtml(r.file || "") + '</div>' +
          '</div>';
      }).join("");
    }

    function openQmdEntry(idx) {
      const r = qmdResults[idx];
      if (!r) return;
      const coll = (r.file || "").replace(/^qmd:\\/\\//, "").split("/")[0] || "";
      const snippet = (r.snippet || "").replace(/^@@.*@@\\n?/gm, "").replace(/@@ .* @@/g, "\\n---\\n").trim();
      document.getElementById("kb-modal-content").innerHTML =
        '<div class="modal-top">' +
          (coll ? '<span class="coll-badge" style="font-size:12px;padding:2px 8px">' + escHtml(coll) + '</span>' : '') +
          (r.score != null ? '<span class="modal-id">score: ' + Number(r.score).toFixed(2) + '</span>' : '') +
        '</div>' +
        '<div class="modal-title">' + escHtml(r.title || r.file || "Untitled") + '</div>' +
        '<hr class="modal-divider">' +
        (snippet ? '<div class="modal-section"><div class="modal-section-label">Excerpt</div><div class="modal-section-body">' + escHtml(snippet) + '</div></div>' : '') +
        '<div style="font-size:11px;color:#3f3f46;margin-top:16px">' + escHtml(r.file || "") + '</div>';
      document.getElementById("kb-backdrop").classList.add("open");
      document.getElementById("kb-modal").scrollTop = 0;
    }

    // Debounced search handlers
    let kbSearchTimer = null;
    function debouncedKbSearch(val) {
      clearTimeout(kbSearchTimer);
      kbSearchTimer = setTimeout(() => {
        kbEntries = []; // force reload on search
        loadKbList(val);
      }, 400);
    }
    let qmdSearchTimer = null;
    function debouncedQmdSearch(val) {
      clearTimeout(qmdSearchTimer);
      qmdSearchTimer = setTimeout(() => loadQmdList(val), 400);
    }

    // ==================== CRON ====================
    let cronData = null;
    async function loadCron() {
      const list = document.getElementById("cron-list");
      if (!list) return;
      try {
        const res = await fetch("/data/cron");
        if (!res.ok) throw new Error("bad response");
        cronData = await res.json();
      } catch {
        list.innerHTML = '<div class="mem-empty">Failed to load cron data</div>';
        return;
      }
      renderCronTimeline(cronData);
    }

    function statusBadgeClass(status) {
      if (status === "ok") return "status-ok";
      if (status === "error") return "status-error";
      if (status === "timeout") return "status-timeout";
      return "status-unknown";
    }

    function formatScheduleClient(schedule) {
      if (!schedule) return "";
      if (schedule.kind === "every") {
        const ms = schedule.everyMs;
        if (ms < 60000) return "every " + ms/1000 + "s";
        if (ms < 3600000) return "every " + ms/60000 + "m";
        if (ms < 86400000) return "every " + ms/3600000 + "h";
        return "every " + ms/86400000 + "d";
      }
      if (schedule.kind === "cron") {
        return (schedule.expr || "") + (schedule.tz ? " (" + schedule.tz + ")" : "");
      }
      return "";
    }

    function expandCronField(field, lo, hi) {
      if (!field || field === "*") { const r = []; for (let i = lo; i <= hi; i++) r.push(i); return r; }
      if (field.includes(",")) return field.split(",").flatMap(f => expandCronField(f.trim(), lo, hi));
      if (field.startsWith("*/")) { const step = parseInt(field.slice(2)); const r = []; for (let i = lo; i <= hi; i++) if ((i - lo) % step === 0) r.push(i); return r; }
      if (field.includes("-")) { const [a, b] = field.split("-").map(Number); const r = []; for (let i = Math.max(lo,a); i <= Math.min(hi,b); i++) r.push(i); return r; }
      const n = parseInt(field); return isNaN(n) ? [] : [Math.max(lo, Math.min(hi, n))];
    }

    function getCronWindowTimes(job, windowStart, windowEnd) {
      const s = job.schedule;
      if (!s) return [];
      if (s.kind === "every") {
        const ms = s.everyMs;
        if (ms < 60 * 60 * 1000) return [{ highFreq: true, everyMs: ms }]; // < 1h = dense
        const anchor = s.anchorMs || windowStart;
        const n = Math.ceil((windowStart - anchor) / ms);
        const times = []; let t = anchor + n * ms;
        while (t <= windowEnd) { if (t >= windowStart) times.push(t); t += ms; }
        return times;
      }
      if (s.kind === "cron") {
        const fields = (s.expr || "").trim().split(/\s+/);
        if (fields.length < 5) return [];
        const minutes = expandCronField(fields[0], 0, 59);
        const hours   = expandCronField(fields[1], 0, 23);
        const times = [];
        for (let d = -1; d <= 2; d++) {
          const base = new Date(windowStart); base.setDate(base.getDate() + d); base.setHours(0,0,0,0);
          const baseMs = base.getTime();
          for (const h of hours) for (const m of minutes) {
            const t = baseMs + (h * 60 + m) * 60000;
            if (t >= windowStart && t <= windowEnd) times.push(t);
          }
        }
        return times.sort((a, b) => a - b);
      }
      return [];
    }

    function renderCronTimeline(data) {
      const list = document.getElementById("cron-list");
      if (!data || !data.jobs || data.jobs.length === 0) {
        list.innerHTML = '<div class="mem-empty">No cron jobs</div>';
        return;
      }
      const now = Date.now();
      const W = 12 * 3600000; // 12h window each side
      const windowStart = now - W, windowEnd = now + W;
      const dur = W * 2;
      const pct = ms => ((ms - windowStart) / dur * 100).toFixed(2);

      // Axis hour labels every 2h
      const axisLabels = [];
      for (let i = -12; i <= 12; i += 2) {
        const t = now + i * 3600000;
        const d = new Date(t);
        const lbl = i === 0 ? "NOW" : d.getHours() + ":" + String(d.getMinutes()).padStart(2,"0");
        axisLabels.push('<span class="tl-hour-label' + (i===0?' tl-now-label':'') + '" style="left:' + pct(t) + '%">' + lbl + '</span>');
      }

      const rows = data.jobs.map((job, i) => {
        const state = job.state || {};
        const runs  = (data.runs || {})[job.id] || [];
        const lastStatus = runs[0]?.status || state.lastRunStatus || "";
        const fireTimes = getCronWindowTimes(job, windowStart, windowEnd);

        let track = "";
        if (fireTimes.length > 0 && fireTimes[0].highFreq) {
          const lbl = "every " + fmtDuration(fireTimes[0].everyMs);
          track = '<div class="tl-highfreq" style="left:0;width:50%;background:rgba(63,63,70,.5)"></div>' +
                  '<div class="tl-highfreq" style="left:50%;width:50%;background:rgba(59,130,246,.25)"></div>' +
                  '<span class="tl-freq-label">' + escHtml(lbl) + '</span>';
        } else {
          const futureTimes = fireTimes.filter(t => t >= now);
          const nextTime = futureTimes[0];
          track = fireTimes.map(ms => {
            const isPast = ms < now;
            const isNext = ms === nextTime;
            let cls = "tl-dot " + (isPast ? "tl-dot-past" : isNext ? "tl-dot-next" : "tl-dot-future");
            if (isPast && lastStatus) cls += " tl-dot-" + lastStatus;
            const d = new Date(ms);
            const tip = d.getHours() + ":" + String(d.getMinutes()).padStart(2,"0");
            return '<div class="' + cls + '" style="left:' + pct(ms) + '%" title="' + tip + '"></div>';
          }).join("");
        }

        return '<div class="tl-row" onclick="openCronJob(' + i + ')">' +
          '<div class="tl-job-meta">' +
            '<span class="tl-enabled-dot" style="background:' + (job.enabled ? '#16a34a' : '#52525b') + '"></span>' +
            '<span class="tl-job-name" title="' + escHtml(job.name || job.id) + '">' + escHtml(job.name || job.id) + '</span>' +
            (lastStatus ? '<span class="status-badge ' + statusBadgeClass(lastStatus) + '">' + escHtml(lastStatus) + '</span>' : '') +
          '</div>' +
          '<div class="tl-track">' + track + '<div class="tl-now-line"></div></div>' +
        '</div>';
      }).join("");

      list.innerHTML = '<div class="tl-container">' +
        '<div class="tl-axis">' + axisLabels.join("") + '</div>' +
        '<div class="tl-body">' + rows + '</div>' +
        '</div>';
    }

    function openCronJob(idx) {
      if (!cronData) return;
      const job = cronData.jobs[idx];
      if (!job) return;
      const runs = (cronData.runs || {})[job.id] || [];
      const state = job.state || {};
      const lastStatus = runs[0]?.status || state.lastRunStatus || "";

      const runsHtml = runs.length === 0 ? '<div class="mem-empty">No run history</div>' :
        '<div class="cron-run-list">' + runs.map(r => {
          return '<div class="cron-run-item">' +
            '<div class="cron-run-header">' +
              '<span class="status-badge ' + statusBadgeClass(r.status) + '">' + escHtml(r.status || "?") + '</span>' +
              '<span style="font-size:11px;color:#71717a">' + escHtml(fmtMs(r.runAtMs || r.ts)) + '</span>' +
              (r.durationMs ? '<span style="font-size:11px;color:#52525b">' + escHtml(fmtDuration(r.durationMs)) + '</span>' : '') +
            '</div>' +
            (r.summary ? '<div class="cron-run-body">' + escHtml(r.summary) + '</div>' : '') +
            (r.error ? '<div class="cron-run-body" style="color:#fca5a5">' + escHtml(r.error) + '</div>' : '') +
            '</div>';
        }).join("") + '</div>';

      document.getElementById("cron-modal-content").innerHTML =
        '<div class="modal-top">' +
          '<span class="enabled-dot ' + (job.enabled ? "on" : "off") + '" style="width:9px;height:9px;display:inline-block;border-radius:50%;margin-right:4px;background:' + (job.enabled ? "#16a34a" : "#52525b") + '"></span>' +
          (lastStatus ? '<span class="status-badge ' + statusBadgeClass(lastStatus) + '">' + escHtml(lastStatus) + '</span>' : '') +
        '</div>' +
        '<div class="modal-title">' + escHtml(job.name || job.id) + '</div>' +
        '<hr class="modal-divider">' +
        '<div class="modal-section">' +
          '<div class="modal-section-label">Schedule</div>' +
          '<div style="font-size:13px;color:#a1a1aa;font-family:monospace">' + escHtml(formatScheduleClient(job.schedule)) + '</div>' +
        '</div>' +
        '<div class="modal-section">' +
          '<div class="modal-section-label">Run History</div>' +
          runsHtml +
        '</div>' +
        '<div style="font-size:11px;color:#3f3f46;margin-top:16px">job id: ' + escHtml(job.id) + '</div>';

      document.getElementById("cron-backdrop").classList.add("open");
      document.getElementById("cron-modal").scrollTop = 0;
    }
  </script>
</body>
</html>`;
}

// ==================== HTTP SERVER ====================

const { cardsDir, projectsDir, stateDir, webPort } = resolveConfig();
console.log(`[brain-web] cardsDir=${cardsDir} projectsDir=${projectsDir} port=${webPort}`);

const server = http.createServer((req, res) => {
  if (req.method !== "GET") {
    res.writeHead(405, { "Content-Type": "text/plain" });
    res.end("Method Not Allowed");
    return;
  }
  const parsed = url.parse(req.url ?? "/", true);
  const pathname = parsed.pathname ?? "/";
  const selectedProjectId = typeof parsed.query.project === "string" ? parsed.query.project : "";

  // /data — board JSON for live polling
  if (pathname === "/data") {
    try {
      const allCards = listCards(cardsDir);
      const allProjects = listProjects(projectsDir);
      const cards = selectedProjectId
        ? allCards.filter(c => c.project_id === selectedProjectId)
        : allCards;
      res.writeHead(200, { "Content-Type": "application/json", "Cache-Control": "no-cache" });
      res.end(JSON.stringify({ cards, projects: allProjects }));
    } catch {
      res.writeHead(500); res.end("{}");
    }
    return;
  }

  // /data/kb — KB entries list
  if (pathname === "/data/kb") {
    try {
      const entries = readKbEntries();
      res.writeHead(200, { "Content-Type": "application/json", "Cache-Control": "no-cache" });
      res.end(JSON.stringify(entries));
    } catch (err) {
      console.error(`[brain-web] /data/kb error: ${err}`);
      res.writeHead(500); res.end("[]");
    }
    return;
  }

  // /data/cron — cron jobs + last runs
  if (pathname === "/data/cron") {
    try {
      const data = readCronData();
      res.writeHead(200, { "Content-Type": "application/json", "Cache-Control": "no-cache" });
      res.end(JSON.stringify(data));
    } catch (err) {
      console.error(`[brain-web] /data/cron error: ${err}`);
      res.writeHead(500); res.end('{"jobs":[],"runs":{}}');
    }
    return;
  }

  // /data/qmd — recent QMD memory files (no search query needed)
  if (pathname === "/data/qmd") {
    try {
      const entries = readRecentQmdFiles(20);
      res.writeHead(200, { "Content-Type": "application/json", "Cache-Control": "no-cache" });
      res.end(JSON.stringify(entries));
    } catch (err) {
      console.error(`[brain-web] /data/qmd error: ${err}`);
      res.writeHead(500); res.end("[]");
    }
    return;
  }

  // /data/active — active agent loops (pickup log)
  if (pathname === "/data/active") {
    try {
      const activeFile = path.join(stateDir, "active-work.json");
      let data = { active: [], log: [] };
      try { data = JSON.parse(fs.readFileSync(activeFile, "utf-8")); } catch { /* empty */ }
      res.writeHead(200, { "Content-Type": "application/json", "Cache-Control": "no-cache" });
      res.end(JSON.stringify(data));
    } catch (err) {
      console.error(`[brain-web] /data/active error: ${err}`);
      res.writeHead(500); res.end('{"active":[],"log":[]}');
    }
    return;
  }

  // /api/search/kb — KB full-text search via openclaw mc-kb
  if (pathname === "/api/search/kb") {
    const q = typeof parsed.query.q === "string" ? parsed.query.q.trim() : "";
    if (!q) {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end('{"results":[]}');
      return;
    }
    try {
      const result = spawnSync("openclaw", ["mc-kb", "search", q, "--json"], {
        encoding: "utf-8", timeout: 30000,
      });
      let results = [];
      if (result.status === 0 && result.stdout) {
        try { results = JSON.parse(result.stdout); } catch { /* parse error */ }
      } else if (result.stderr) {
        console.error(`[brain-web] mc-kb search error: ${result.stderr.slice(0, 200)}`);
      }
      if (!Array.isArray(results)) results = [];
      res.writeHead(200, { "Content-Type": "application/json", "Cache-Control": "no-cache" });
      res.end(JSON.stringify({ results }));
    } catch (err) {
      console.error(`[brain-web] /api/search/kb error: ${err}`);
      res.writeHead(500); res.end('{"results":[]}');
    }
    return;
  }

  // /api/search/qmd — QMD search
  if (pathname === "/api/search/qmd") {
    const q = typeof parsed.query.q === "string" ? parsed.query.q.trim() : "";
    if (!q) {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end('{"results":[]}');
      return;
    }
    try {
      const result = spawnSync(QMD_BIN, ["search", q, "--json"], {
        encoding: "utf-8", timeout: 10000,
      });
      let results = [];
      if (result.status === 0 && result.stdout) {
        try { results = JSON.parse(result.stdout); } catch { /* parse error */ }
      } else if (result.stderr) {
        console.error(`[brain-web] qmd search error: ${result.stderr.slice(0, 200)}`);
      }
      if (!Array.isArray(results)) results = [];
      res.writeHead(200, { "Content-Type": "application/json", "Cache-Control": "no-cache" });
      res.end(JSON.stringify({ results }));
    } catch (err) {
      console.error(`[brain-web] /api/search/qmd error: ${err}`);
      res.writeHead(500); res.end('{"results":[]}');
    }
    return;
  }

  const parts = pathname.split("/").filter(Boolean);

  // /board/:projectId/:cardId — card detail page
  if (parts[0] === "board" && parts.length === 3) {
    try {
      const [, projectId, cardId] = parts;
      const allCards = listCards(cardsDir);
      const allProjects = listProjects(projectsDir);
      const card = allCards.find(c => c.id === cardId);
      if (!card) { res.writeHead(404, { "Content-Type": "text/plain" }); res.end("Card not found"); return; }
      const project = allProjects.find(p => p.id === projectId);
      const html = renderCardDetail(card, project);
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-cache, no-store" });
      res.end(html);
    } catch (err) {
      console.error(`[brain-web] card detail error: ${err}`);
      res.writeHead(500, { "Content-Type": "text/plain" }); res.end("Internal Server Error");
    }
    return;
  }

  // /board/:projectId — project filtered board
  if (parts[0] === "board" && parts.length === 2) {
    try {
      const projectId = parts[1];
      const allCards = listCards(cardsDir);
      const allProjects = listProjects(projectsDir);
      const project = allProjects.find(p => p.id === projectId);
      if (!project) { res.writeHead(404, { "Content-Type": "text/plain" }); res.end("Project not found"); return; }
      const cards = allCards.filter(c => c.project_id === projectId);
      const html = renderPage(cards, allProjects, projectId, new Date());
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-cache, no-store" });
      res.end(html);
    } catch (err) {
      console.error(`[brain-web] project filter error: ${err}`);
      res.writeHead(500, { "Content-Type": "text/plain" }); res.end("Internal Server Error");
    }
    return;
  }

  // /, /board, /memory, /scheduling — main page (tab controlled by URL path)
  if (parts.length === 0 || pathname === "/board" || pathname === "/memory" || pathname === "/scheduling") {
    try {
      const allCards = listCards(cardsDir);
      const allProjects = listProjects(projectsDir);
      const html = renderPage(allCards, allProjects, "", new Date());
      res.writeHead(200, {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "no-cache, no-store",
        "X-Content-Type-Options": "nosniff",
      });
      res.end(html);
    } catch (err) {
      console.error(`[brain-web] render error: ${err}`);
      res.writeHead(500, { "Content-Type": "text/plain" });
      res.end("Internal Server Error");
    }
    return;
  }

  res.writeHead(404, { "Content-Type": "text/plain" });
  res.end("Not Found");
});

server.listen(webPort, "0.0.0.0", () => {
  console.log(`[brain-web] listening at http://localhost:${webPort}`);
});

server.on("error", (err) => {
  if (err.code === "EADDRINUSE") {
    console.error(`[brain-web] port ${webPort} already in use`);
    process.exit(1);
  } else {
    console.error(`[brain-web] server error: ${err.message}`);
  }
});
