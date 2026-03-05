/**
 * format-log-events.ts
 *
 * Human-readable Telegram message formatters for board events,
 * cross-bot signals, escalations, and activity logs.
 *
 * Used by: mc-queue plugin after_tool_call hook
 * Output: HTML-formatted strings for sendMessage API
 */

export type BoardEventKind = "ship" | "human_needed" | "create_card" | "update_card" | "move_card";
export type SignalType = "working_on" | "blocked" | "done" | "escalate" | "status";

export interface BoardEvent {
  kind: BoardEventKind;
  cardId: string;
  title: string;
  projectId?: string;
  reason?: string; // for "human_needed", "blocked"
  fromColumn?: string; // for "move_card"
  toColumn?: string; // for "move_card"
  timestamp?: number;
}

export interface Signal {
  type: SignalType;
  sender: string; // "augmentedmike_bot" or "augmentedryan_bot"
  recipient?: string; // if recipient, show as "sender → recipient"
  cardId: string;
  title?: string;
  reason?: string; // for "blocked", "escalate"
  progress?: number; // for "status" (0-100)
  estimatedDone?: string; // for "working_on" (ISO timestamp)
  timestamp?: number;
}

export interface EscalationEvent {
  sender: string;
  severity: "low" | "medium" | "high" | "critical";
  title: string;
  description: string;
  cardId?: string;
  dueBy?: string; // ISO timestamp
  timestamp?: number;
}

/**
 * Format a board event into human-readable Telegram HTML.
 *
 * Examples:
 *   ship       → "🚀 Shipped: Task Title (crd_abc) — [link]"
 *   move_card  → "🔄 crd_abc moved: in-progress → in-review — [link]"
 *   human_needed → "🚨 BLOCKED: crd_abc — Task Title — reason text — [link]"
 */
export function formatBoardEvent(ev: BoardEvent, boardUrl: string = ""): string {
  const link = formatCardLink(ev.cardId, ev.projectId, boardUrl);

  switch (ev.kind) {
    case "ship":
      return `🚀 <b>Shipped:</b> ${escapeHtml(ev.title || ev.cardId)}${link}`;

    case "human_needed":
      const reason = ev.reason ? ` — ${escapeHtml(ev.reason)}` : "";
      return `🚨 <b>BLOCKED:</b> <code>${ev.cardId}</code> ${ev.title ? "— " + escapeHtml(ev.title) : ""}${reason}${link}`;

    case "create_card":
      return `✨ <b>Created:</b> <code>${ev.cardId}</code> ${ev.title ? "— " + escapeHtml(ev.title) : ""}${link}`;

    case "update_card":
      return `📝 <b>Updated:</b> <code>${ev.cardId}</code> ${ev.title ? "— " + escapeHtml(ev.title) : ""}${link}`;

    case "move_card":
      const from = ev.fromColumn || "?";
      const to = ev.toColumn || "?";
      return `🔄 <b>Moved:</b> <code>${ev.cardId}</code> ${from} → ${to}${link}`;

    default:
      return `📌 <code>${ev.cardId}</code>${link}`;
  }
}

/**
 * Format a cross-bot signal.
 *
 * Examples:
 *   working_on → "🔗 @augmentedmike_bot working on crd_abc (est. done: 2pm) — Task Title"
 *   blocked    → "⛔ @augmentedmike_bot blocked on crd_abc — waiting for X"
 *   done       → "✅ @augmentedmike_bot done: crd_abc shipped"
 *   escalate   → "📢 @augmentedmike_bot escalates: crd_abc — needs human decision"
 */
export function formatSignal(sig: Signal, boardUrl: string = ""): string {
  const link = sig.cardId ? formatCardLink(sig.cardId, undefined, boardUrl) : "";
  const sender = escapeHtml(sig.sender);

  if (sig.recipient) {
    // Cross-bot signal: "sender → recipient"
    const recipient = escapeHtml(sig.recipient);
    switch (sig.type) {
      case "working_on":
        const est = sig.estimatedDone ? ` (est. done: ${formatTime(sig.estimatedDone)})` : "";
        return `🔗 ${sender} → ${recipient}: working on <code>${sig.cardId}</code>${est}${link}\n   <i>${escapeHtml(sig.title || "")}</i>`;

      case "blocked":
        const reason = sig.reason ? `\n   <i>${escapeHtml(sig.reason)}</i>` : "";
        return `⛔ ${sender} → ${recipient}: blocked on <code>${sig.cardId}</code>${reason}${link}`;

      case "done":
        return `✅ ${sender} → ${recipient}: done <code>${sig.cardId}</code>${link}`;

      case "escalate":
        const desc = sig.reason ? `\n   <i>${escapeHtml(sig.reason)}</i>` : "";
        return `📢 ${sender} → ${recipient}: escalates <code>${sig.cardId}</code>${desc}${link}`;

      case "status":
        const pct = sig.progress ?? 0;
        return `📊 ${sender} → ${recipient}: progress on <code>${sig.cardId}</code> — ${pct}%${link}`;
    }
  } else {
    // Unidirectional signal (e.g., activity heartbeat)
    switch (sig.type) {
      case "working_on":
        const est = sig.estimatedDone ? ` (est. done: ${formatTime(sig.estimatedDone)})` : "";
        return `🔗 ${sender} working on <code>${sig.cardId}</code>${est}${link}`;

      case "blocked":
        const reason = sig.reason ? `: ${escapeHtml(sig.reason)}` : "";
        return `⛔ ${sender} blocked on <code>${sig.cardId}</code>${reason}${link}`;

      case "done":
        return `✅ ${sender} done: <code>${sig.cardId}</code>${link}`;

      case "escalate":
        return `📢 ${sender} escalates <code>${sig.cardId}</code>${link}`;

      case "status":
        const pct = sig.progress ?? 0;
        return `📊 ${sender}: progress ${pct}% on <code>${sig.cardId}</code>${link}`;
    }
  }
}

/**
 * Format an escalation event (human decision needed).
 *
 * Example:
 *   "🚨 CRITICAL — Pricing decision needed\n
 *    From: @augmentedmike_bot\n
 *    Due: today 6pm\n
 *    Card: crd_abc\n
 *    \nContext: Does PHI ever touch third-party models?..."
 */
export function formatEscalation(esc: EscalationEvent, boardUrl: string = ""): string {
  const link = esc.cardId ? formatCardLink(esc.cardId, undefined, boardUrl) : "";
  const sender = escapeHtml(esc.sender);
  const severity = severityEmoji(esc.severity);
  const dueText = esc.dueBy ? `\n<b>Due:</b> ${formatTime(esc.dueBy)}` : "";
  const cardText = esc.cardId ? `\n<b>Card:</b> <code>${esc.cardId}</code>${link}` : "";
  const desc = escapeHtml(esc.description);

  return (
    `${severity} <b>${escapeHtml(esc.title)}</b>\n` +
    `<b>From:</b> ${sender}${dueText}${cardText}\n\n` +
    `<i>${desc}</i>`
  );
}

/**
 * Format a batch of board events for a session (cron worker summary).
 *
 * Example output:
 *   📊 board-worker-in-progress
 *   ✅ crd_abc shipped
 *   📝 crd_def notes updated
 *   🚨 crd_ghi blocked (human input needed)
 *   Duration: 5m 23s
 */
export function formatSessionSummary(
  sessionName: string,
  events: BoardEvent[],
  durationMs: number,
): string {
  const eventLines = events
    .map(ev => {
      const link = "";
      switch (ev.kind) {
        case "ship":
          return `✅ <code>${ev.cardId}</code> shipped`;
        case "human_needed":
          return `🚨 <code>${ev.cardId}</code> blocked`;
        case "create_card":
          return `✨ <code>${ev.cardId}</code> created`;
        case "update_card":
          return `📝 <code>${ev.cardId}</code> updated`;
        case "move_card":
          const from = ev.fromColumn || "?";
          const to = ev.toColumn || "?";
          return `🔄 <code>${ev.cardId}</code> ${from} → ${to}`;
        default:
          return `📌 <code>${ev.cardId}</code>`;
      }
    })
    .join("\n");

  const duration = formatDuration(durationMs);

  return (
    `📊 <b>${escapeHtml(sessionName)}</b>\n` +
    `${eventLines || "(no events)"}` +
    `\n<i>Duration: ${duration}</i>`
  );
}

/**
 * Helper: format card link as Telegram HTML anchor.
 */
function formatCardLink(
  cardId: string,
  projectId?: string,
  boardUrl?: string,
): string {
  if (!boardUrl) return "";
  const cleanUrl = boardUrl.replace(/\/$/, "");
  const cardPath = projectId
    ? `/board/${projectId}/${cardId}`
    : `/board/${cardId}`;
  return ` — <a href="${cleanUrl}${cardPath}">${cardId}</a>`;
}

/**
 * Helper: format ISO timestamp as human-readable.
 */
function formatTime(isoOrMs: string | number): string {
  const d = typeof isoOrMs === "string" ? new Date(isoOrMs) : new Date(isoOrMs);
  if (isNaN(d.getTime())) return "unknown";
  const h = d.getHours().toString().padStart(2, "0");
  const m = d.getMinutes().toString().padStart(2, "0");
  return `${h}:${m}`;
}

/**
 * Helper: format duration in ms to "Xm Ys" or "Xs".
 */
function formatDuration(ms: number): string {
  const totalSeconds = Math.round(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  if (minutes === 0) return `${seconds}s`;
  if (seconds === 0) return `${minutes}m`;
  return `${minutes}m ${seconds}s`;
}

/**
 * Helper: map severity to emoji.
 */
function severityEmoji(severity: string): string {
  switch (severity) {
    case "critical":
      return "🔴";
    case "high":
      return "🟠";
    case "medium":
      return "🟡";
    case "low":
      return "🔵";
    default:
      return "⚪";
  }
}

/**
 * Helper: escape HTML special characters.
 */
function escapeHtml(text: string): string {
  if (!text) return "";
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
