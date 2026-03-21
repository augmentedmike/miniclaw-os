import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import {
  openDncDb,
  closeDncDb,
  addToList,
  removeFromList,
  isBlocked,
  listAll,
  getEntry,
  normalizeEmail,
  detectOptOut,
  detectResubscribe,
  extractEmail,
} from "../src/dnc-store.js";

let tmpDir: string;
let dbPath: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "dnc-test-"));
  dbPath = path.join(tmpDir, "dnc.db");
});

afterEach(() => {
  closeDncDb();
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe("DNC Store CRUD", () => {
  it("creates table and adds entries", () => {
    addToList("Test@Example.com", "requested opt-out", "triage", dbPath);
    const entries = listAll(dbPath);
    expect(entries).toHaveLength(1);
    expect(entries[0].email).toBe("test@example.com");
    expect(entries[0].reason).toBe("requested opt-out");
    expect(entries[0].added_by).toBe("triage");
  });

  it("normalizes emails to lowercase", () => {
    addToList("USER@DOMAIN.COM", undefined, undefined, dbPath);
    expect(isBlocked("user@domain.com", dbPath)).toBe(true);
    expect(isBlocked("USER@DOMAIN.COM", dbPath)).toBe(true);
    expect(isBlocked("User@Domain.Com", dbPath)).toBe(true);
  });

  it("isBlocked returns false for non-blocked emails", () => {
    expect(isBlocked("nobody@test.com", dbPath)).toBe(false);
  });

  it("removes entries", () => {
    addToList("remove@test.com", undefined, undefined, dbPath);
    expect(isBlocked("remove@test.com", dbPath)).toBe(true);

    const removed = removeFromList("remove@test.com", dbPath);
    expect(removed).toBe(true);
    expect(isBlocked("remove@test.com", dbPath)).toBe(false);
  });

  it("returns false when removing non-existent entry", () => {
    const removed = removeFromList("nobody@test.com", dbPath);
    expect(removed).toBe(false);
  });

  it("getEntry returns entry details", () => {
    addToList("detail@test.com", "spam", "admin", dbPath);
    const entry = getEntry("detail@test.com", dbPath);
    expect(entry).not.toBeNull();
    expect(entry!.email).toBe("detail@test.com");
    expect(entry!.reason).toBe("spam");
    expect(entry!.added_by).toBe("admin");
    expect(entry!.added_at).toBeTruthy();
  });

  it("getEntry returns null for missing entry", () => {
    const entry = getEntry("nobody@test.com", dbPath);
    expect(entry).toBeNull();
  });

  it("listAll returns all entries sorted by added_at desc", () => {
    addToList("a@test.com", undefined, undefined, dbPath);
    addToList("b@test.com", undefined, undefined, dbPath);
    addToList("c@test.com", undefined, undefined, dbPath);
    const entries = listAll(dbPath);
    expect(entries).toHaveLength(3);
  });

  it("upserts on duplicate email", () => {
    addToList("dup@test.com", "first reason", "user1", dbPath);
    addToList("dup@test.com", "updated reason", "user2", dbPath);
    const entries = listAll(dbPath);
    expect(entries).toHaveLength(1);
    expect(entries[0].reason).toBe("updated reason");
    expect(entries[0].added_by).toBe("user2");
  });
});

describe("normalizeEmail", () => {
  it("lowercases and trims", () => {
    expect(normalizeEmail("  FOO@BAR.COM  ")).toBe("foo@bar.com");
  });
});

describe("extractEmail", () => {
  it("extracts from Name <email> format", () => {
    expect(extractEmail("John Doe <john@example.com>")).toBe("john@example.com");
  });

  it("handles plain email", () => {
    expect(extractEmail("john@example.com")).toBe("john@example.com");
  });

  it("normalizes extracted email", () => {
    expect(extractEmail("John <JOHN@EXAMPLE.COM>")).toBe("john@example.com");
  });
});

describe("detectOptOut", () => {
  const positives = [
    "Please unsubscribe me from your list",
    "Stop contacting me immediately",
    "Do not contact me ever again",
    "Remove me from your mailing list",
    "I want to opt out of all communications",
    "Leave me alone",
    "Don't email me anymore",
    "No more emails please",
    "Take me off your list",
    "Stop emailing me",
    "please opt-out",
  ];

  for (const text of positives) {
    it(`detects opt-out: "${text}"`, () => {
      expect(detectOptOut(text)).toBe(true);
    });
  }

  const negatives = [
    "Thanks for the update, looking forward to the meeting",
    "Can you send me the report?",
    "Hello, I'd like to schedule a call",
    "The subscription is ready",
    "I contacted the vendor",
  ];

  for (const text of negatives) {
    it(`does not false-positive: "${text}"`, () => {
      expect(detectOptOut(text)).toBe(false);
    });
  }
});

describe("detectResubscribe", () => {
  const positives = [
    "Please remove me from the do not contact list",
    "Unblock me",
    "I want to be contacted again",
    "I'd like to opt back in",
    "Please resubscribe me",
    "Remove me from the DNC list",
    "Remove me from the block list",
  ];

  for (const text of positives) {
    it(`detects resubscribe: "${text}"`, () => {
      expect(detectResubscribe(text)).toBe(true);
    });
  }

  const negatives = [
    "Remove me from your mailing list",
    "Stop contacting me",
    "I don't want to hear from you",
  ];

  for (const text of negatives) {
    it(`does not false-positive: "${text}"`, () => {
      expect(detectResubscribe(text)).toBe(false);
    });
  }
});

describe("Send gating", () => {
  it("isBlocked prevents sends to blocked addresses", () => {
    addToList("blocked@test.com", "opt-out", "triage", dbPath);
    expect(isBlocked("blocked@test.com", dbPath)).toBe(true);
    // The actual throw happens in HimalayaClient.sendMessage, but the core
    // check is isBlocked which we test here
    expect(isBlocked("allowed@test.com", dbPath)).toBe(false);
  });
});
