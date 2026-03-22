/**
 * commands.test.ts — CLI integration tests for brain commands
 *
 * Strategy: build a real commander program + CardStore in a tmp dir,
 * drive commands via program.parseAsync, capture stdout/stderr with spies.
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { Command } from "commander";
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
  type Mock,
} from "vitest";
import { registerBrainCommands } from "./commands.js";
import { CardStore } from "../src/store.js";
import { ProjectStore } from "../src/project-store.js";
import { openDb } from "../src/db.js";
import type { Card } from "../src/card.js";

// ---- Test harness ----

let tmpDir: string;
let stateDir: string;
let store: CardStore;
let program: Command;
let stdoutSpy: Mock<(...args: unknown[]) => void>;
let stderrSpy: Mock<(...args: unknown[]) => void>;
let exitSpy: Mock<(...args: unknown[]) => never>;
let origLog: typeof console.log;
let origError: typeof console.error;
let origExit: typeof process.exit;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "brain-cli-test-"));
  stateDir = tmpDir;
  const db = openDb(stateDir);
  store = new CardStore(db);
  const projects = new ProjectStore(db);

  program = new Command();
  program.exitOverride(); // throw instead of process.exit

  origLog = console.log;
  origError = console.error;
  origExit = process.exit;

  stdoutSpy = vi.spyOn(console, "log").mockImplementation(() => {});
  stderrSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  exitSpy = vi.spyOn(process, "exit").mockImplementation((_code?: number) => {
    throw new Error(`process.exit(${_code})`);
  }) as unknown as Mock<(...args: unknown[]) => never>;

  registerBrainCommands(
    {
      program,
      stateDir,
      logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
    },
    store,
    projects,
  );
});

afterEach(() => {
  stdoutSpy?.mockRestore();
  stderrSpy?.mockRestore();
  exitSpy?.mockRestore();
  if (tmpDir) fs.rmSync(tmpDir, { recursive: true, force: true });
});

async function run(...args: string[]): Promise<void> {
  await program.parseAsync(["node", "cli", ...args]);
}

function lastOut(): string {
  const calls = stdoutSpy.mock.calls;
  return calls.length > 0 ? String(calls[calls.length - 1][0]) : "";
}

function allOut(): string {
  return stdoutSpy.mock.calls.map(c => String(c[0])).join("\n");
}

function lastErr(): string {
  const calls = stderrSpy.mock.calls;
  return calls.length > 0 ? String(calls[calls.length - 1][0]) : "";
}

function allErr(): string {
  return stderrSpy.mock.calls.map(c => String(c[0])).join("\n");
}

// ---- Helpers ----

async function createCard(title: string, priority = "medium"): Promise<Card> {
  await run("mc-board", "create", "--title", title, "--priority", priority);
  const cards = store.list();
  return cards.find(c => c.title === title)!;
}

async function fullCycleCard(title: string): Promise<Card> {
  const card = await createCard(title);
  store.update(card.id, {
    problem_description: "Problem",
    implementation_plan: "Plan",
    acceptance_criteria: "- [x] done",
  });
  await run("mc-board", "move", card.id, "in-progress");
  await run("mc-board", "move", card.id, "in-review");
  store.update(card.id, { review_notes: "Commit abc1234 on main. no-pr. LGTM" });
  await run("mc-board", "move", card.id, "shipped");
  return store.findById(card.id);
}

// ---- brain create ----

describe("brain create", () => {
  it("creates a card in backlog", async () => {
    await run("mc-board", "create", "--title", "My task");
    const cards = store.list("backlog");
    expect(cards).toHaveLength(1);
    expect(cards[0].title).toBe("My task");
    expect(cards[0].priority).toBe("medium");
    expect(lastOut()).toMatch(/Created crd_/);
  });

  it("creates with high priority", async () => {
    await run("mc-board", "create", "--title", "Urgent", "--priority", "high");
    const cards = store.list("backlog");
    expect(cards[0].priority).toBe("high");
  });

  it("creates with tags", async () => {
    await run("mc-board", "create", "--title", "Tagged", "--tags", "miniclaw,build");
    const cards = store.list("backlog");
    expect(cards[0].tags).toEqual(["miniclaw", "build"]);
  });

  it("rejects invalid priority", async () => {
    await expect(run("mc-board", "create", "--title", "x", "--priority", "ultra")).rejects.toThrow();
    expect(allErr()).toMatch(/Invalid priority/);
    expect(store.list()).toHaveLength(0);
  });

  it("requires --title", async () => {
    await expect(run("mc-board", "create")).rejects.toThrow();
    expect(store.list()).toHaveLength(0);
  });
});

// ---- brain list ----

describe("brain list", () => {
  it("shows all cards", async () => {
    await createCard("Card A");
    await createCard("Card B");
    stdoutSpy.mockClear();
    await run("mc-board", "list");
    const out = allOut();
    expect(out).toContain("Card A");
    expect(out).toContain("Card B");
  });

  it("filters by column", async () => {
    await createCard("Backlog card");
    stdoutSpy.mockClear();
    await run("mc-board", "list", "--column", "in-progress");
    expect(lastOut()).toBe("No cards.");
  });

  it("shows No cards when empty", async () => {
    await run("mc-board", "list");
    expect(lastOut()).toBe("No cards.");
  });

  it("rejects invalid column", async () => {
    await expect(run("mc-board", "list", "--column", "done")).rejects.toThrow();
    expect(allErr()).toMatch(/Invalid column/);
  });

  it("shows tags in listing", async () => {
    await run("mc-board", "create", "--title", "Tagged", "--tags", "foo,bar");
    stdoutSpy.mockClear();
    await run("mc-board", "list");
    expect(lastOut()).toContain("[foo, bar]");
  });

  it("--skip-hold filters out cards tagged 'hold'", async () => {
    const card1 = await createCard("Active card");
    const card2 = await createCard("Held card");
    store.update(card2.id, { tags: ["hold"] });
    stdoutSpy.mockClear();
    await run("mc-board", "list", "--skip-hold");
    const out = allOut();
    expect(out).toContain("Active card");
    expect(out).not.toContain("Held card");
  });

  it("--skip-hold filters out cards tagged 'blocked'", async () => {
    const card1 = await createCard("Active card");
    const card2 = await createCard("Blocked card");
    store.update(card2.id, { tags: ["blocked"] });
    stdoutSpy.mockClear();
    await run("mc-board", "list", "--skip-hold");
    const out = allOut();
    expect(out).toContain("Active card");
    expect(out).not.toContain("Blocked card");
  });

  it("--skip-hold filters cards with both 'hold' and other tags", async () => {
    const card1 = await createCard("Normal card");
    const card2 = await createCard("Card with hold and tags");
    store.update(card2.id, { tags: ["hold", "waiting"] });
    stdoutSpy.mockClear();
    await run("mc-board", "list", "--skip-hold");
    const out = allOut();
    expect(out).toContain("Normal card");
    expect(out).not.toContain("Card with hold and tags");
  });
});

// ---- brain show ----

describe("brain show", () => {
  it("shows card detail", async () => {
    const card = await createCard("Show me");
    stdoutSpy.mockClear();
    await run("mc-board", "show", card.id);
    const out = allOut();
    expect(out).toContain("Show me");
    expect(out).toContain("Problem Description");
    expect(out).toContain("Acceptance Criteria");
  });

  it("errors on unknown id", async () => {
    await expect(run("mc-board", "show", "crd_nope")).rejects.toThrow();
    expect(allErr()).toMatch(/not found/i);
  });
});

// ---- brain update ----

describe("brain update", () => {
  it("updates title", async () => {
    const card = await createCard("Old title");
    await run("mc-board", "update", card.id, "--title", "New title");
    const updated = store.findById(card.id);
    expect(updated.title).toBe("New title");
  });

  it("updates problem, plan, criteria", async () => {
    const card = await createCard("Work card");
    await run(
      "mc-board", "update", card.id,
      "--problem", "The bug",
      "--plan", "The fix",
      "--criteria", "- [ ] step one",
    );
    const updated = store.findById(card.id);
    expect(updated.problem_description).toBe("The bug");
    expect(updated.implementation_plan).toBe("The fix");
    expect(updated.acceptance_criteria).toBe("- [ ] step one");
  });

  it("updates notes and review", async () => {
    const card = await createCard("Review card");
    await run("mc-board", "update", card.id, "--notes", "Done", "--review", "LGTM");
    const updated = store.findById(card.id);
    expect(updated.notes).toBe("Done");
    expect(updated.review_notes).toBe("LGTM");
  });

  it("errors when no fields provided", async () => {
    const card = await createCard("No-op");
    await expect(run("mc-board", "update", card.id)).rejects.toThrow();
    expect(allErr()).toMatch(/No fields to update/);
  });

  it("errors on invalid priority", async () => {
    const card = await createCard("Pri card");
    await expect(run("mc-board", "update", card.id, "--priority", "urgent")).rejects.toThrow();
    expect(allErr()).toMatch(/Invalid priority/);
  });

  it("errors on unknown card id", async () => {
    await expect(run("mc-board", "update", "crd_ghost", "--title", "x")).rejects.toThrow();
    expect(allErr()).toMatch(/not found/i);
  });
});

// ---- brain move ----

describe("brain move", () => {
  it("moves backlog → in-progress when gates pass", async () => {
    const card = await createCard("Ready card");
    store.update(card.id, {
      problem_description: "Problem",
      implementation_plan: "Plan",
      acceptance_criteria: "- [ ] step",
    });
    await run("mc-board", "move", card.id, "in-progress");
    expect(store.findById(card.id).column).toBe("in-progress");
    expect(lastOut()).toMatch(/in-progress/);
  });

  it("blocks move when gate fields missing", async () => {
    const card = await createCard("Not ready");
    await expect(run("mc-board", "move", card.id, "in-progress")).rejects.toThrow();
    expect(store.findById(card.id).column).toBe("backlog");
  });

  it("blocks skipping columns", async () => {
    const card = await createCard("Skip attempt");
    await expect(run("mc-board", "move", card.id, "in-review")).rejects.toThrow();
    expect(allErr()).toMatch(/No valid transition exists/);
  });

  it("blocks backwards movement", async () => {
    const card = await createCard("Going back");
    store.update(card.id, {
      problem_description: "P",
      implementation_plan: "P",
      acceptance_criteria: "- [ ] x",
    });
    await run("mc-board", "move", card.id, "in-progress");
    await expect(run("mc-board", "move", card.id, "backlog")).rejects.toThrow();
  });

  it("moves in-progress → in-review when criteria checked", async () => {
    const card = await createCard("In flight");
    store.update(card.id, {
      problem_description: "P",
      implementation_plan: "P",
      acceptance_criteria: "- [x] done",
    });
    await run("mc-board", "move", card.id, "in-progress");
    await run("mc-board", "move", card.id, "in-review");
    expect(store.findById(card.id).column).toBe("in-review");
  });

  it("blocks in-review → shipped without review notes", async () => {
    const card = await createCard("Needs review");
    store.update(card.id, {
      problem_description: "P",
      implementation_plan: "P",
      acceptance_criteria: "- [x] done",
    });
    await run("mc-board", "move", card.id, "in-progress");
    await run("mc-board", "move", card.id, "in-review");
    await expect(run("mc-board", "move", card.id, "shipped")).rejects.toThrow();
    expect(store.findById(card.id).column).toBe("in-review");
  });

  it("moves to shipped when review notes present", async () => {
    const card = await fullCycleCard("Shippable");
    expect(card.column).toBe("shipped");
  });

  it("--force bypasses gate checks", async () => {
    const card = await createCard("Force move");
    await run("mc-board", "move", card.id, "in-progress", "--force");
    expect(store.findById(card.id).column).toBe("in-progress");
  });

  it("errors on invalid column", async () => {
    const card = await createCard("Bad col");
    await expect(run("mc-board", "move", card.id, "done")).rejects.toThrow();
    expect(allErr()).toMatch(/Invalid column/);
  });

  it("records column history", async () => {
    const card = await createCard("History card");
    store.update(card.id, {
      problem_description: "P",
      implementation_plan: "P",
      acceptance_criteria: "- [x] done",
    });
    await run("mc-board", "move", card.id, "in-progress");
    const updated = store.findById(card.id);
    expect(updated.history).toHaveLength(2);
    expect(updated.history[1].column).toBe("in-progress");
  });
});

// ---- brain board ----

describe("brain board", () => {
  it("shows empty board message", async () => {
    await run("mc-board", "board");
    expect(lastOut()).toMatch(/no cards/i);
  });

  it("renders cards grouped by column", async () => {
    await createCard("Card A");
    await createCard("Card B", "high");
    stdoutSpy.mockClear();
    await run("mc-board", "board");
    const out = allOut();
    expect(out).toContain("BACKLOG");
    expect(out).toContain("Card A");
    expect(out).toContain("Card B");
  });
});

// ---- brain next ----

describe("brain next", () => {
  it("returns nothing when board is empty", async () => {
    await run("mc-board", "next");
    expect(lastOut()).toMatch(/no actionable/i);
  });

  it("suggests in-progress over backlog", async () => {
    await createCard("Backlog card");
    const inProgress = await createCard("Active card");
    store.update(inProgress.id, {
      problem_description: "P",
      implementation_plan: "P",
      acceptance_criteria: "- [ ] x",
    });
    await run("mc-board", "move", inProgress.id, "in-progress");
    stdoutSpy.mockClear();
    await run("mc-board", "next");
    expect(allOut()).toContain("Active card");
  });

  it("suggests high priority over medium", async () => {
    await createCard("Medium card", "medium");
    await createCard("High card", "high");
    stdoutSpy.mockClear();
    await run("mc-board", "next");
    expect(lastOut()).toContain("High card");
  });

  it("ignores shipped cards", async () => {
    await fullCycleCard("Shipped card");
    stdoutSpy.mockClear();
    await run("mc-board", "next");
    expect(lastOut()).toMatch(/no actionable/i);
  });
});

// ---- brain archive ----

describe("brain archive", () => {
  it("archives a shipped card and removes it from board", async () => {
    const card = await fullCycleCard("Done card");
    expect(store.findById(card.id).column).toBe("shipped");

    await run("mc-board", "archive", card.id);

    expect(lastOut()).toMatch(/Archived/);
    expect(() => store.findById(card.id)).toThrow();
  });

  it("archives a backlog card", async () => {
    const card = await createCard("Backlog card");
    expect(store.findById(card.id).column).toBe("backlog");
    await run("mc-board", "archive", card.id);
    expect(lastOut()).toMatch(/Archived/);
    expect(() => store.findById(card.id)).toThrow();
  });

  it("archives an in-progress card", async () => {
    const card = await createCard("In progress card");
    store.update(card.id, {
      problem_description: "Problem",
      implementation_plan: "Plan",
      acceptance_criteria: "- [ ] todo",
    });
    await run("mc-board", "move", card.id, "in-progress");
    expect(store.findById(card.id).column).toBe("in-progress");
    await run("mc-board", "archive", card.id);
    expect(lastOut()).toMatch(/Archived/);
    expect(() => store.findById(card.id)).toThrow();
  });

  it("archives an in-review card", async () => {
    const card = await createCard("In review card");
    store.update(card.id, {
      problem_description: "Problem",
      implementation_plan: "Plan",
      acceptance_criteria: "- [x] done",
    });
    await run("mc-board", "move", card.id, "in-progress");
    await run("mc-board", "move", card.id, "in-review");
    expect(store.findById(card.id).column).toBe("in-review");
    await run("mc-board", "archive", card.id);
    expect(lastOut()).toMatch(/Archived/);
    expect(() => store.findById(card.id)).toThrow();
  });

  it("errors on unknown card id", async () => {
    await expect(run("mc-board", "archive", "crd_ghost")).rejects.toThrow();
    expect(allErr()).toMatch(/not found/i);
  });
});

// ---- brain archive-list ----

describe("brain archive-list", () => {
  it("shows no archives message when empty", async () => {
    await run("mc-board", "archive-list");
    expect(lastOut()).toMatch(/No archives/);
  });

  it("shows archive after archiving a card", async () => {
    const card = await fullCycleCard("Archived card");
    await run("mc-board", "archive", card.id);
    stdoutSpy.mockClear();
    await run("mc-board", "archive-list");
    expect(lastOut()).toContain("brain-archive-001.jsonl.gz");
    expect(lastOut()).toContain("1 cards");
  });
});

// ---- brain archive-search ----

describe("brain archive-search", () => {
  it("finds archived cards by title", async () => {
    const card = await fullCycleCard("Deploy pipeline fix");
    await run("mc-board", "archive", card.id);
    stdoutSpy.mockClear();
    await run("mc-board", "archive-search", "pipeline");
    expect(lastOut()).toContain("Deploy pipeline fix");
  });

  it("returns no-match message when not found", async () => {
    const card = await fullCycleCard("Something else");
    await run("mc-board", "archive", card.id);
    stdoutSpy.mockClear();
    await run("mc-board", "archive-search", "nonexistent");
    expect(lastOut()).toMatch(/No archived cards matching/);
  });
});

// ---- brain archive-show ----

describe("brain archive-show", () => {
  it("shows full detail of archived card", async () => {
    const card = await fullCycleCard("Full detail card");
    await run("mc-board", "archive", card.id);
    stdoutSpy.mockClear();
    await run("mc-board", "archive-show", card.id);
    const out = allOut();
    expect(out).toContain("Full detail card");
    expect(out).toContain("Problem Description");
  });

  it("errors on unknown archived id", async () => {
    await expect(run("mc-board", "archive-show", "crd_ghost")).rejects.toThrow();
    expect(allErr()).toMatch(/not found/i);
  });
});
