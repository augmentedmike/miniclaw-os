#!/usr/bin/env node
/**
 * miniclaw-brain web server — standalone process
 * Installed as: com.augmentedmike.miniclaw-brain-web (LaunchAgent)
 * Runs independently of the openclaw gateway on port 4220.
 */

import * as http from "node:http";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";

// ---- Config ----

function resolveConfig() {
  const configPath = path.join(os.homedir(), ".openclaw", "openclaw.json");
  try {
    const raw = JSON.parse(fs.readFileSync(configPath, "utf-8"));
    const entry = raw?.plugins?.entries?.["miniclaw-brain"]?.config ?? {};
    const cardsDir = resolvePath(
      entry.cardsDir ?? "~/.openclaw/user/augmentedmike_bot/brain/cards",
    );
    const webPort = Number(entry.webPort ?? 4220);
    return { cardsDir, webPort };
  } catch {
    return {
      cardsDir: path.join(os.homedir(), ".openclaw", "user", "augmentedmike_bot", "brain", "cards"),
      webPort: 4220,
    };
  }
}

function resolvePath(p) {
  return p.startsWith("~/") ? path.join(os.homedir(), p.slice(2)) : p;
}

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

// ---- HTML rendering ----

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

function renderCard(card) {
  const { checked, total } = criteriaProgress(card.acceptance_criteria);
  const showProgress = card.column === "in-progress" || card.column === "in-review";
  const priorityColor = PRIORITY_COLORS[card.priority] ?? PRIORITY_COLORS.low;
  const tagsHtml = card.tags.length > 0
    ? `<div class="card-tags">${card.tags.map(t => `<span class="tag">${escHtml(t)}</span>`).join("")}</div>`
    : "";
  const problemPreview = card.problem_description
    ? `<p class="card-preview">${escHtml(card.problem_description.split("\n")[0]?.slice(0, 100) ?? "")}</p>`
    : "";
  return `<div class="card" data-id="${escHtml(card.id)}" onclick="openCard('${escHtml(card.id)}')">
    <div class="card-header">
      <span class="card-id">${escHtml(card.id)}</span>
      <span class="priority-dot" style="background:${priorityColor}" title="${card.priority}"></span>
    </div>
    <div class="card-title">${escHtml(card.title)}</div>
    ${problemPreview}${tagsHtml}
    ${showProgress ? progressBar(checked, total) : ""}
    <div class="card-meta">updated ${fmtDate(card.updated_at)}</div>
  </div>`;
}

function renderColumn(col, cards) {
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
        : colCards.map(renderCard).join("")}
    </div>
  </div>`;
}

function renderSection(label, content) {
  if (!content || !content.trim()) return "";
  // Render acceptance criteria lines as real checkboxes
  const rendered = content
    .split("\n")
    .map(line => {
      const unchecked = line.match(/^- \[ \] (.+)/);
      const checked   = line.match(/^- \[x\] (.+)/);
      if (unchecked) return `<label class="check-item"><input type="checkbox" disabled> ${escHtml(unchecked[1])}</label>`;
      if (checked)   return `<label class="check-item checked"><input type="checkbox" checked disabled> ${escHtml(checked[1])}</label>`;
      return `<span class="content-line">${escHtml(line)}</span>`;
    })
    .join("\n");
  return `<div class="modal-section">
    <div class="modal-section-label">${label}</div>
    <div class="modal-section-body">${rendered}</div>
  </div>`;
}

function renderPage(cards, refreshedAt) {
  const columns = COLUMNS.map(col => renderColumn(col, cards)).join("");
  const totalActive = cards.filter(c => c.column !== "shipped").length;
  const totalShipped = cards.filter(c => c.column === "shipped").length;
  // Embed card data for modal JS — escape </script> to prevent injection
  const cardsJson = JSON.stringify(cards).replace(/<\/script>/gi, "<\\/script>");
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Brain Board — Miniclaw</title>
  <style>
    *,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
    body{background:#09090b;color:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,monospace;min-height:100vh;padding:24px}
    .page-header{display:flex;align-items:baseline;gap:16px;margin-bottom:28px}
    .page-title{font-size:22px;font-weight:700;letter-spacing:-.5px;color:#fafafa}
    .page-subtitle{font-size:13px;color:#71717a}
    .page-stats{margin-left:auto;font-size:12px;color:#52525b}
    .board{display:grid;grid-template-columns:repeat(4,1fr);gap:16px;align-items:start}
    @media(max-width:1100px){.board{grid-template-columns:repeat(2,1fr)}}
    @media(max-width:600px){.board{grid-template-columns:1fr}}
    .column{background:rgba(39,39,42,.6);backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px);border:1px solid rgba(63,63,70,.5);border-radius:12px;padding:16px;min-height:120px}
    .column-header{display:flex;align-items:center;justify-content:space-between;margin-bottom:14px}
    .column-badge{font-size:11px;font-weight:700;letter-spacing:.08em;padding:3px 10px;border-radius:9999px}
    .bg-zinc-600{background:#52525b}.text-zinc-100{color:#f4f4f5}
    .bg-blue-600{background:#2563eb}.text-blue-50{color:#eff6ff}
    .bg-amber-500{background:#f59e0b}.text-amber-950{color:#451a03}
    .bg-green-600{background:#16a34a}.text-green-50{color:#f0fdf4}
    .column-count{font-size:13px;color:#71717a;font-weight:500}
    .column-empty{text-align:center;color:#3f3f46;font-size:13px;padding:24px 0;font-style:italic}
    .column-cards{display:flex;flex-direction:column;gap:10px}
    .card{background:rgba(24,24,27,.7);border:1px solid rgba(63,63,70,.4);border-radius:8px;padding:12px;transition:border-color .15s;cursor:pointer}
    .card:hover{border-color:rgba(113,113,122,.6);background:rgba(39,39,42,.8)}
    .card-header{display:flex;align-items:center;justify-content:space-between;margin-bottom:6px}
    .card-id{font-size:10px;color:#52525b;font-family:monospace;letter-spacing:.03em}
    .priority-dot{width:8px;height:8px;border-radius:50%;flex-shrink:0}
    .card-title{font-size:14px;font-weight:500;color:#e4e4e7;line-height:1.4;margin-bottom:6px}
    .card-preview{font-size:12px;color:#71717a;line-height:1.4;margin-bottom:8px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
    .card-tags{display:flex;flex-wrap:wrap;gap:4px;margin-bottom:8px}
    .tag{font-size:10px;padding:1px 6px;border-radius:4px;background:rgba(63,63,70,.6);color:#a1a1aa;border:1px solid rgba(63,63,70,.4)}
    .criteria-bar{height:4px;background:#27272a;border-radius:2px;overflow:hidden;margin-bottom:4px}
    .criteria-fill{height:100%;border-radius:2px;transition:width .3s ease}
    .criteria-label{font-size:10px;color:#71717a}
    .card-meta{font-size:10px;color:#3f3f46;margin-top:8px}
    .footer{margin-top:28px;font-size:11px;color:#3f3f46;text-align:center}

    /* Modal */
    .modal-backdrop{position:fixed;inset:0;background:#09090b;z-index:100;opacity:0;pointer-events:none;transition:opacity .1s;overflow-y:auto}
    .modal-backdrop.open{opacity:1;pointer-events:all}
    .modal{width:100%;min-height:100%;max-width:900px;margin:0 auto;padding:40px 48px;position:relative;transform:translateY(8px);transition:transform .1s}
    .modal-backdrop.open .modal{transform:translateY(0)}
    .modal-close{position:absolute;top:16px;right:16px;background:none;border:none;color:#52525b;font-size:20px;cursor:pointer;line-height:1;padding:4px 8px;border-radius:6px}
    .modal-close:hover{background:rgba(63,63,70,.4);color:#a1a1aa}
    .modal-top{display:flex;align-items:center;gap:10px;margin-bottom:6px}
    .modal-id{font-size:11px;color:#52525b;font-family:monospace}
    .modal-col-badge{font-size:11px;font-weight:700;letter-spacing:.06em;padding:2px 8px;border-radius:9999px}
    .modal-priority{font-size:11px;padding:2px 8px;border-radius:9999px;border:1px solid currentColor}
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
  </style>
</head>
<body>
  <header class="page-header">
    <h1 class="page-title">Brain Board</h1>
    <span class="page-subtitle">miniclaw · read-only · click card for detail</span>
    <span class="page-stats">${totalActive} active · ${totalShipped} shipped</span>
  </header>
  <main class="board">${columns}</main>
  <footer class="footer">Last updated: ${refreshedAt.toISOString()} · port 4220</footer>

  <div class="modal-backdrop" id="backdrop">
    <div class="modal" id="modal">
      <button class="modal-close" onclick="closeCard()">✕</button>
      <div id="modal-content"></div>
    </div>
  </div>

  <script>
    const CARDS = ${cardsJson};
    const COLUMN_STYLES = {
      "backlog":     { badge: "bg-zinc-600 text-zinc-100", label: "BACKLOG" },
      "in-progress": { badge: "bg-blue-600 text-blue-50",  label: "IN PROGRESS" },
      "in-review":   { badge: "bg-amber-500 text-amber-950", label: "IN REVIEW" },
      "shipped":     { badge: "bg-green-600 text-green-50", label: "SHIPPED" },
    };

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
      } catch { return iso; }
    }

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

      const historyHtml = (card.history || []).map(h =>
        '<div class="history-row"><span class="history-col">' + escHtml(h.column) + '</span><span>' + escHtml(h.moved_at) + '</span></div>'
      ).join("");

      document.getElementById("modal-content").innerHTML =
        '<div class="modal-top">' +
          '<span class="modal-id">' + escHtml(card.id) + '</span>' +
          '<span class="modal-col-badge ' + style.badge + '">' + style.label + '</span>' +
          '<span class="modal-priority priority-' + escHtml(card.priority) + '">' + escHtml(card.priority) + '</span>' +
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

    function closeCard() {
      document.getElementById("backdrop").classList.remove("open");
    }

    document.addEventListener("keydown", e => { if (e.key === "Escape") closeCard(); });
  </script>
</body>
</html>`;
}

// ---- HTTP server ----

const { cardsDir, webPort } = resolveConfig();
console.log(`[brain-web] cardsDir=${cardsDir} port=${webPort}`);

const server = http.createServer((req, res) => {
  if (req.method !== "GET") {
    res.writeHead(405, { "Content-Type": "text/plain" });
    res.end("Method Not Allowed");
    return;
  }
  const url = req.url ?? "/";
  if (url !== "/" && url !== "/index.html") {
    res.writeHead(404, { "Content-Type": "text/plain" });
    res.end("Not Found");
    return;
  }
  try {
    const cards = listCards(cardsDir);
    const html = renderPage(cards, new Date());
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
