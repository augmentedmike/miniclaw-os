import type { Card, Column } from "../src/card.js";
import type { Project } from "../src/project.js";
import { COLUMNS } from "../src/state.js";

// ---- Column styling ----

const COLUMN_STYLES: Record<Column, { badge: string; label: string }> = {
  "backlog": { badge: "bg-zinc-600 text-zinc-100", label: "BACKLOG" },
  "in-progress": { badge: "bg-blue-600 text-blue-50", label: "IN PROGRESS" },
  "in-review": { badge: "bg-amber-500 text-amber-950", label: "IN REVIEW" },
  "shipped": { badge: "bg-green-600 text-green-50", label: "SHIPPED" },
};

const PRIORITY_STYLES: Record<string, string> = {
  high: "#ef4444",   // red-500
  medium: "#f97316", // orange-500
  low: "#52525b",    // zinc-600
};

// ---- Acceptance criteria progress bar ----

function criteriaProgress(criteria: string): { checked: number; total: number } {
  const total = (criteria.match(/^- \[[ x]\]/gm) ?? []).length;
  const checked = (criteria.match(/^- \[x\]/gm) ?? []).length;
  return { checked, total };
}

function progressBar(checked: number, total: number): string {
  if (total === 0) return "";
  const pct = Math.round((checked / total) * 100);
  const color = pct === 100 ? "#22c55e" : pct >= 50 ? "#f97316" : "#3b82f6";
  return `
    <div class="criteria-bar" title="${checked}/${total} criteria done (${pct}%)">
      <div class="criteria-fill" style="width:${pct}%; background:${color}"></div>
    </div>
    <span class="criteria-label">${checked}/${total} criteria</span>
  `;
}

// ---- Card HTML ----

function renderCard(card: Card, projectMap: Map<string, string>): string {
  const { checked, total } = criteriaProgress(card.acceptance_criteria);
  const progress = (card.column === "in-progress" || card.column === "in-review")
    ? progressBar(checked, total)
    : "";

  const priorityColor = PRIORITY_STYLES[card.priority] ?? PRIORITY_STYLES.low;
  const tagsHtml = card.tags.length > 0
    ? `<div class="card-tags">${card.tags.map(t => `<span class="tag">${escHtml(t)}</span>`).join("")}</div>`
    : "";

  const problemPreview = card.problem_description
    ? `<p class="card-preview">${escHtml(card.problem_description.split("\n")[0]?.slice(0, 100) ?? "")}</p>`
    : "";

  const projectName = card.project_id ? projectMap.get(card.project_id) : undefined;
  const projectBadge = projectName
    ? `<a class="project-badge" href="/?project=${escHtml(card.project_id!)}" title="Filter by project">${escHtml(projectName)}</a>`
    : "";

  return `
    <div class="card">
      <div class="card-header">
        <span class="card-id">${escHtml(card.id)}</span>
        <span class="priority-dot" style="background:${priorityColor}" title="${card.priority} priority"></span>
      </div>
      <div class="card-title">${escHtml(card.title)}</div>
      ${problemPreview}
      ${projectBadge}
      ${tagsHtml}
      ${progress}
      <div class="card-meta">updated ${fmtDate(card.updated_at)}</div>
    </div>
  `;
}

// ---- Column HTML ----

function renderColumn(col: Column, cards: Card[], projectMap: Map<string, string>): string {
  const style = COLUMN_STYLES[col];
  const colCards = cards.filter(c => c.column === col);

  return `
    <div class="column">
      <div class="column-header">
        <span class="column-badge ${style.badge}">${style.label}</span>
        <span class="column-count">${colCards.length}</span>
      </div>
      <div class="column-cards">
        ${colCards.length === 0
          ? `<div class="column-empty">empty</div>`
          : colCards.map(c => renderCard(c, projectMap)).join("")}
      </div>
    </div>
  `;
}

// ---- Project dropdown ----

function renderProjectDropdown(projects: Project[], selectedProjectId: string): string {
  if (projects.length === 0) return "";

  const options = [
    `<option value="" ${selectedProjectId === "" ? "selected" : ""}>All projects</option>`,
    ...projects.map(p => {
      const archived = p.status === "archived" ? " (archived)" : "";
      const sel = selectedProjectId === p.id ? "selected" : "";
      return `<option value="${escHtml(p.id)}" ${sel}>${escHtml(p.name)}${archived}</option>`;
    }),
  ].join("");

  return `
    <form class="project-filter" method="get" action="/">
      <label class="filter-label" for="project-select">Project</label>
      <select id="project-select" name="project" onchange="this.form.submit()" class="filter-select">
        ${options}
      </select>
      ${selectedProjectId ? `<a class="filter-clear" href="/">✕</a>` : ""}
    </form>
  `;
}

// ---- Full page ----

export function renderPage(
  cards: Card[],
  projects: Project[],
  selectedProjectId: string,
  refreshedAt: Date,
): string {
  const projectMap = new Map(projects.map(p => [p.id, p.name]));
  const columns = COLUMNS.map(col => renderColumn(col, cards, projectMap)).join("");
  const totalActive = cards.filter(c => c.column !== "shipped").length;
  const totalShipped = cards.filter(c => c.column === "shipped").length;

  const selectedProject = selectedProjectId
    ? projects.find(p => p.id === selectedProjectId)
    : undefined;

  const title = selectedProject
    ? `Brain Board — ${escHtml(selectedProject.name)}`
    : "Brain Board";

  const refreshParam = selectedProjectId ? `?project=${encodeURIComponent(selectedProjectId)}` : "";

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="refresh" content="10;url=/${refreshParam}">
  <title>${title} — Miniclaw</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

    body {
      background: #09090b;
      color: #f4f4f5;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, monospace;
      min-height: 100vh;
      padding: 24px;
    }

    .page-header {
      display: flex;
      align-items: center;
      gap: 16px;
      margin-bottom: 28px;
      flex-wrap: wrap;
    }

    .page-title {
      font-size: 22px;
      font-weight: 700;
      letter-spacing: -0.5px;
      color: #fafafa;
    }

    .page-subtitle {
      font-size: 13px;
      color: #71717a;
    }

    .page-stats {
      margin-left: auto;
      font-size: 12px;
      color: #52525b;
    }

    /* ---- Project filter ---- */

    .project-filter {
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .filter-label {
      font-size: 12px;
      color: #71717a;
      white-space: nowrap;
    }

    .filter-select {
      background: #18181b;
      color: #e4e4e7;
      border: 1px solid #3f3f46;
      border-radius: 6px;
      padding: 4px 28px 4px 10px;
      font-size: 13px;
      cursor: pointer;
      appearance: none;
      -webkit-appearance: none;
      background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%2371717a' stroke-width='2'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E");
      background-repeat: no-repeat;
      background-position: right 8px center;
      min-width: 160px;
    }

    .filter-select:focus {
      outline: none;
      border-color: #52525b;
    }

    .filter-clear {
      color: #52525b;
      text-decoration: none;
      font-size: 13px;
      padding: 4px 6px;
      border-radius: 4px;
      line-height: 1;
    }

    .filter-clear:hover {
      color: #a1a1aa;
      background: #27272a;
    }

    /* ---- Board ---- */

    .board {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 16px;
      align-items: start;
    }

    @media (max-width: 1100px) {
      .board { grid-template-columns: repeat(2, 1fr); }
    }

    @media (max-width: 600px) {
      .board { grid-template-columns: 1fr; }
    }

    .column {
      background: rgba(39, 39, 42, 0.6);
      backdrop-filter: blur(12px);
      -webkit-backdrop-filter: blur(12px);
      border: 1px solid rgba(63, 63, 70, 0.5);
      border-radius: 12px;
      padding: 16px;
      min-height: 120px;
    }

    .column-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 14px;
    }

    .column-badge {
      font-size: 11px;
      font-weight: 700;
      letter-spacing: 0.08em;
      padding: 3px 10px;
      border-radius: 9999px;
    }

    .bg-zinc-600 { background: #52525b; }
    .text-zinc-100 { color: #f4f4f5; }
    .bg-blue-600 { background: #2563eb; }
    .text-blue-50 { color: #eff6ff; }
    .bg-amber-500 { background: #f59e0b; }
    .text-amber-950 { color: #451a03; }
    .bg-green-600 { background: #16a34a; }
    .text-green-50 { color: #f0fdf4; }

    .column-count {
      font-size: 13px;
      color: #71717a;
      font-weight: 500;
    }

    .column-empty {
      text-align: center;
      color: #3f3f46;
      font-size: 13px;
      padding: 24px 0;
      font-style: italic;
    }

    .column-cards {
      display: flex;
      flex-direction: column;
      gap: 10px;
    }

    .card {
      background: rgba(24, 24, 27, 0.7);
      border: 1px solid rgba(63, 63, 70, 0.4);
      border-radius: 8px;
      padding: 12px;
      transition: border-color 0.15s;
    }

    .card:hover {
      border-color: rgba(113, 113, 122, 0.6);
    }

    .card-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 6px;
    }

    .card-id {
      font-size: 10px;
      color: #52525b;
      font-family: monospace;
      letter-spacing: 0.03em;
    }

    .priority-dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      flex-shrink: 0;
    }

    .card-title {
      font-size: 14px;
      font-weight: 500;
      color: #e4e4e7;
      line-height: 1.4;
      margin-bottom: 6px;
    }

    .card-preview {
      font-size: 12px;
      color: #71717a;
      line-height: 1.4;
      margin-bottom: 8px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .project-badge {
      display: inline-block;
      font-size: 10px;
      padding: 1px 7px;
      border-radius: 4px;
      background: rgba(37, 99, 235, 0.15);
      color: #93c5fd;
      border: 1px solid rgba(37, 99, 235, 0.3);
      margin-bottom: 7px;
      text-decoration: none;
      cursor: pointer;
    }

    .project-badge:hover {
      background: rgba(37, 99, 235, 0.25);
      border-color: rgba(37, 99, 235, 0.5);
    }

    .card-tags {
      display: flex;
      flex-wrap: wrap;
      gap: 4px;
      margin-bottom: 8px;
    }

    .tag {
      font-size: 10px;
      padding: 1px 6px;
      border-radius: 4px;
      background: rgba(63, 63, 70, 0.6);
      color: #a1a1aa;
      border: 1px solid rgba(63, 63, 70, 0.4);
    }

    .criteria-bar {
      height: 4px;
      background: #27272a;
      border-radius: 2px;
      overflow: hidden;
      margin-bottom: 4px;
    }

    .criteria-fill {
      height: 100%;
      border-radius: 2px;
      transition: width 0.3s ease;
    }

    .criteria-label {
      font-size: 10px;
      color: #71717a;
    }

    .card-meta {
      font-size: 10px;
      color: #3f3f46;
      margin-top: 8px;
    }

    .footer {
      margin-top: 28px;
      font-size: 11px;
      color: #3f3f46;
      text-align: center;
    }
  </style>
</head>
<body>
  <header class="page-header">
    <h1 class="page-title">Brain Board</h1>
    <span class="page-subtitle">miniclaw · read-only · auto-refresh 10s</span>
    ${renderProjectDropdown(projects, selectedProjectId)}
    <span class="page-stats">${totalActive} active · ${totalShipped} shipped</span>
  </header>

  <main class="board">
    ${columns}
  </main>

  <footer class="footer">
    Last updated: ${refreshedAt.toISOString()} · port 4220
  </footer>
</body>
</html>`;
}

// ---- Helpers ----

function escHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function fmtDate(iso: string): string {
  try {
    const d = new Date(iso);
    const now = Date.now();
    const diff = now - d.getTime();
    if (diff < 60_000) return "just now";
    if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
    if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
    return `${Math.floor(diff / 86_400_000)}d ago`;
  } catch {
    return iso;
  }
}
