/**
 * format-log-events.test.ts
 *
 * Unit tests for event formatters.
 * Run with: npm test -- lib/__tests__/format-log-events.test.ts
 */

import { describe, it, expect } from "vitest";
import {
  formatBoardEvent,
  formatSignal,
  formatEscalation,
  formatSessionSummary,
  type BoardEvent,
  type Signal,
  type EscalationEvent,
} from "../format-log-events";

describe("format-log-events", () => {
  const boardUrl = "http://100.73.107.114:4220";

  describe("formatBoardEvent", () => {
    it("formats a ship event", () => {
      const ev: BoardEvent = {
        kind: "ship",
        cardId: "crd_abc123",
        title: "Fix navbar z-index",
      };
      const result = formatBoardEvent(ev, boardUrl);
      expect(result).toContain("🚀");
      expect(result).toContain("Shipped");
      expect(result).toContain("Fix navbar z-index");
      expect(result).toContain("crd_abc123");
    });

    it("formats a human_needed event", () => {
      const ev: BoardEvent = {
        kind: "human_needed",
        cardId: "crd_def456",
        title: "Pricing decision",
        reason: "Awaiting approval from finance",
      };
      const result = formatBoardEvent(ev, boardUrl);
      expect(result).toContain("🚨");
      expect(result).toContain("BLOCKED");
      expect(result).toContain("Awaiting approval from finance");
    });

    it("formats a create_card event", () => {
      const ev: BoardEvent = {
        kind: "create_card",
        cardId: "crd_new111",
        title: "Implement dark mode",
      };
      const result = formatBoardEvent(ev, boardUrl);
      expect(result).toContain("✨");
      expect(result).toContain("Created");
    });

    it("formats a move_card event", () => {
      const ev: BoardEvent = {
        kind: "move_card",
        cardId: "crd_xyz789",
        title: "Blog post",
        fromColumn: "in-progress",
        toColumn: "in-review",
      };
      const result = formatBoardEvent(ev, boardUrl);
      expect(result).toContain("🔄");
      expect(result).toContain("Moved");
      expect(result).toContain("in-progress → in-review");
    });

    it("includes card link when boardUrl provided", () => {
      const ev: BoardEvent = {
        kind: "ship",
        cardId: "crd_abc123",
        title: "Test",
        projectId: "prj_123",
      };
      const result = formatBoardEvent(ev, boardUrl);
      expect(result).toContain("href=");
      expect(result).toContain("/board/prj_123/crd_abc123");
    });

    it("omits link when boardUrl not provided", () => {
      const ev: BoardEvent = {
        kind: "ship",
        cardId: "crd_abc123",
        title: "Test",
      };
      const result = formatBoardEvent(ev, "");
      expect(result).not.toContain("href=");
    });

    it("escapes HTML in title", () => {
      const ev: BoardEvent = {
        kind: "ship",
        cardId: "crd_test",
        title: "Fix <script> tag vulnerability",
      };
      const result = formatBoardEvent(ev, boardUrl);
      expect(result).toContain("&lt;script&gt;");
      expect(result).not.toContain("<script>");
    });
  });

  describe("formatSignal", () => {
    it("formats a working_on signal with cross-bot routing", () => {
      const sig: Signal = {
        type: "working_on",
        sender: "augmentedmike_bot",
        recipient: "augmentedryan_bot",
        cardId: "crd_123",
        title: "Implement logging",
        estimatedDone: "2026-03-05T14:00:00Z",
      };
      const result = formatSignal(sig, boardUrl);
      expect(result).toContain("🔗");
      expect(result).toContain("augmentedmike_bot");
      expect(result).toContain("→");
      expect(result).toContain("augmentedryan_bot");
      expect(result).toContain("working on");
      expect(result).toContain("est. done");
    });

    it("formats a blocked signal", () => {
      const sig: Signal = {
        type: "blocked",
        sender: "augmentedmike_bot",
        recipient: "augmentedryan_bot",
        cardId: "crd_456",
        reason: "Waiting for API credentials",
      };
      const result = formatSignal(sig, boardUrl);
      expect(result).toContain("⛔");
      expect(result).toContain("blocked");
      expect(result).toContain("Waiting for API credentials");
    });

    it("formats a done signal", () => {
      const sig: Signal = {
        type: "done",
        sender: "augmentedmike_bot",
        recipient: "augmentedryan_bot",
        cardId: "crd_789",
      };
      const result = formatSignal(sig, boardUrl);
      expect(result).toContain("✅");
      expect(result).toContain("done");
    });

    it("formats an escalate signal", () => {
      const sig: Signal = {
        type: "escalate",
        sender: "augmentedmike_bot",
        recipient: "augmentedryan_bot",
        cardId: "crd_esc1",
        reason: "Pricing decision needed",
      };
      const result = formatSignal(sig, boardUrl);
      expect(result).toContain("📢");
      expect(result).toContain("escalates");
    });

    it("formats a status signal with progress", () => {
      const sig: Signal = {
        type: "status",
        sender: "augmentedmike_bot",
        recipient: "augmentedryan_bot",
        cardId: "crd_status",
        progress: 75,
      };
      const result = formatSignal(sig, boardUrl);
      expect(result).toContain("📊");
      expect(result).toContain("75%");
    });

    it("formats a unidirectional signal (no recipient)", () => {
      const sig: Signal = {
        type: "working_on",
        sender: "augmentedmike_bot",
        cardId: "crd_unidirect",
        title: "Solo task",
      };
      const result = formatSignal(sig, boardUrl);
      expect(result).toContain("augmentedmike_bot");
      expect(result).not.toContain("→"); // No arrow for unidirectional
      expect(result).toContain("working on");
    });
  });

  describe("formatEscalation", () => {
    it("formats a critical escalation", () => {
      const esc: EscalationEvent = {
        sender: "augmentedmike_bot",
        severity: "critical",
        title: "Pricing decision",
        description: "Does PHI touch third-party models?",
        cardId: "crd_esc_critical",
        dueBy: "2026-03-05T18:00:00Z",
      };
      const result = formatEscalation(esc, boardUrl);
      expect(result).toContain("🔴"); // critical emoji
      expect(result).toContain("Pricing decision");
      expect(result).toContain("augmentedmike_bot");
      expect(result).toContain("crd_esc_critical");
      expect(result).toContain("Does PHI touch");
    });

    it("formats a high-severity escalation", () => {
      const esc: EscalationEvent = {
        sender: "augmentedmike_bot",
        severity: "high",
        title: "Deploy decision",
        description: "Ready for production?",
      };
      const result = formatEscalation(esc);
      expect(result).toContain("🟠"); // high emoji
    });

    it("formats a low-severity escalation", () => {
      const esc: EscalationEvent = {
        sender: "augmentedmike_bot",
        severity: "low",
        title: "Style feedback",
        description: "Prefer blue or teal?",
      };
      const result = formatEscalation(esc);
      expect(result).toContain("🔵"); // low emoji
    });

    it("omits optional fields", () => {
      const esc: EscalationEvent = {
        sender: "augmentedmike_bot",
        severity: "medium",
        title: "Quick check",
        description: "Is this right?",
      };
      const result = formatEscalation(esc);
      expect(result).toContain("Quick check");
      expect(result).not.toContain("Card:");
      expect(result).not.toContain("Due:");
    });
  });

  describe("formatSessionSummary", () => {
    it("formats a session with multiple events", () => {
      const events: BoardEvent[] = [
        { kind: "ship", cardId: "crd_001", title: "Blog post" },
        { kind: "update_card", cardId: "crd_002", title: "Notes" },
        { kind: "human_needed", cardId: "crd_003", title: "Blocked", reason: "Waiting" },
      ];
      const result = formatSessionSummary("board-worker-in-progress", events, 5 * 60 * 1000);
      expect(result).toContain("📊");
      expect(result).toContain("board-worker-in-progress");
      expect(result).toContain("✅");
      expect(result).toContain("📝");
      expect(result).toContain("🚨");
      expect(result).toContain("5m");
    });

    it("handles empty event list", () => {
      const result = formatSessionSummary("my-session", [], 1000);
      expect(result).toContain("my-session");
      expect(result).toContain("no events");
    });

    it("formats short durations", () => {
      const result = formatSessionSummary("test", [], 30 * 1000);
      expect(result).toContain("30s");
    });

    it("formats long durations", () => {
      const result = formatSessionSummary("test", [], 95 * 1000);
      expect(result).toContain("1m 35s");
    });
  });

  describe("HTML escaping", () => {
    it("escapes special characters in titles", () => {
      const ev: BoardEvent = {
        kind: "ship",
        cardId: "crd_test",
        title: "Fix & verify <edge> 'cases' \"everywhere\"",
      };
      const result = formatBoardEvent(ev);
      expect(result).toContain("&amp;");
      expect(result).toContain("&lt;");
      expect(result).toContain("&gt;");
      expect(result).toContain("&quot;");
      expect(result).toContain("&#39;");
    });

    it("escapes special characters in signal reasons", () => {
      const sig: Signal = {
        type: "blocked",
        sender: "test_bot",
        cardId: "crd_test",
        reason: "Wait for API & <fix> response",
      };
      const result = formatSignal(sig);
      expect(result).toContain("&amp;");
      expect(result).toContain("&lt;");
      expect(result).toContain("&gt;");
    });
  });
});
