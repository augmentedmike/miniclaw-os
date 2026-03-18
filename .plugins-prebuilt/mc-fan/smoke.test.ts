import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "fs";
import path from "path";
import os from "os";
import {
  fansDir,
  readFanRegistry,
  readEngagementLog,
  addFan,
  removeFan,
  getFanById,
  addEngagement,
  type Fan,
  type EngagementLog,
} from "./shared.js";

const originalHome = os.homedir();
let tmpDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "mc-fan-test-"));
  (os as { homedir: () => string }).homedir = () => tmpDir;
});

afterEach(() => {
  (os as { homedir: () => string }).homedir = () => originalHome;
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe("mc-fan shared", () => {
  it("creates fans directory on first access", () => {
    const dir = fansDir();
    expect(fs.existsSync(dir)).toBe(true);
    expect(dir).toContain("fans");
  });

  it("round-trips fan add/list", () => {
    const fan: Fan = {
      id: "dave-shapiro",
      name: "Dave Shapiro",
      platform: "youtube",
      urls: ["https://www.youtube.com/@DaveShap"],
      whyWeFollow: "Philosophical AI thinker",
      engagementStyle: "intellectual-peer",
      tags: ["ai", "philosophy"],
      addedAt: new Date().toISOString(),
    };

    addFan(fan);
    const registry = readFanRegistry();
    expect(registry).toHaveLength(1);
    expect(registry[0].name).toBe("Dave Shapiro");
    expect(registry[0].platform).toBe("youtube");
  });

  it("gets fan by ID", () => {
    const fan: Fan = {
      id: "dave-shapiro",
      name: "Dave Shapiro",
      platform: "youtube",
      urls: ["https://www.youtube.com/@DaveShap"],
      whyWeFollow: "Philosophical AI thinker",
      engagementStyle: "intellectual-peer",
      tags: [],
      addedAt: new Date().toISOString(),
    };

    addFan(fan);
    const found = getFanById("dave-shapiro");
    expect(found).toBeDefined();
    expect(found!.name).toBe("Dave Shapiro");

    const notFound = getFanById("nonexistent");
    expect(notFound).toBeUndefined();
  });

  it("removes a fan", () => {
    const fan: Fan = {
      id: "test-fan",
      name: "Test Fan",
      platform: "github",
      urls: ["https://github.com/test"],
      whyWeFollow: "Testing",
      engagementStyle: "collaborator",
      tags: [],
      addedAt: new Date().toISOString(),
    };

    addFan(fan);
    expect(readFanRegistry()).toHaveLength(1);

    const removed = removeFan("test-fan");
    expect(removed).toBe(true);
    expect(readFanRegistry()).toHaveLength(0);

    const removedAgain = removeFan("test-fan");
    expect(removedAgain).toBe(false);
  });

  it("logs engagement", () => {
    const entry: EngagementLog = {
      fanId: "dave-shapiro",
      action: "watched",
      contentUrl: "https://youtube.com/watch?v=abc123",
      contentTitle: "AI Consciousness Deep Dive",
      timestamp: new Date().toISOString(),
      notes: "Great points about emergent behavior",
    };

    addEngagement(entry);
    const log = readEngagementLog();
    expect(log).toHaveLength(1);
    expect(log[0].fanId).toBe("dave-shapiro");
    expect(log[0].action).toBe("watched");
    expect(log[0].notes).toBe("Great points about emergent behavior");
  });

  it("updates existing fan instead of duplicating", () => {
    const fan: Fan = {
      id: "dave-shapiro",
      name: "Dave Shapiro",
      platform: "youtube",
      urls: ["https://www.youtube.com/@DaveShap"],
      whyWeFollow: "Philosophical AI thinker",
      engagementStyle: "intellectual-peer",
      tags: [],
      addedAt: new Date().toISOString(),
    };

    addFan(fan);
    addFan({ ...fan, whyWeFollow: "Updated reason" });

    const registry = readFanRegistry();
    expect(registry).toHaveLength(1);
    expect(registry[0].whyWeFollow).toBe("Updated reason");
  });
});
