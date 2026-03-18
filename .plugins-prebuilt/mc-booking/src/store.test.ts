import { test, expect, beforeEach, afterEach } from "vitest";
import { openDb, closeDb } from "./db.js";
import { AppointmentStore } from "./store.js";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";

let store: AppointmentStore;
let dbPath: string;

beforeEach(() => {
  dbPath = path.join(os.tmpdir(), `mc-booking-test-${Date.now()}-${Math.random().toString(36).slice(2)}.db`);
  const db = openDb(dbPath);
  store = new AppointmentStore(db);
});

afterEach(() => {
  closeDb();
  try { fs.unlinkSync(dbPath); } catch {}
});

test("create appointment starts as pending", () => {
  const apt = store.create({ name: "Jane", email: "j@e.com", scheduled_time: "2026-04-01T14:00:00Z" });
  expect(apt.id).toMatch(/^apt_/);
  expect(apt.status).toBe("pending");
  expect(apt.duration_min).toBe(30);
  expect(apt.manage_token).toHaveLength(64);
});

test("approve changes status to confirmed", () => {
  const apt = store.create({ name: "Jane", email: "j@e.com", scheduled_time: "2026-04-01T14:00:00Z" });
  const approved = store.approve(apt.id);
  expect(approved).not.toBeNull();
  expect(approved!.status).toBe("confirmed");
  expect(approved!.approved_at).not.toBe("");
});

test("reject changes status to cancelled", () => {
  const apt = store.create({ name: "Jane", email: "j@e.com", scheduled_time: "2026-04-01T14:00:00Z" });
  const rejected = store.reject(apt.id);
  expect(rejected).not.toBeNull();
  expect(rejected!.status).toBe("cancelled");
});

test("cannot approve non-pending", () => {
  const apt = store.create({ name: "Jane", email: "j@e.com", scheduled_time: "2026-04-01T14:00:00Z" });
  store.approve(apt.id);
  expect(store.approve(apt.id)).toBeNull();
});

test("hasConflict detects bookings", () => {
  store.create({ name: "Jane", email: "j@e.com", scheduled_time: "2026-04-01T14:00:00Z" });
  expect(store.hasConflict("2026-04-01T14:00:00Z")).toBe(true);
  expect(store.hasConflict("2026-04-01T15:00:00Z")).toBe(false);
});

test("cancelled appointments dont conflict", () => {
  const apt = store.create({ name: "Jane", email: "j@e.com", scheduled_time: "2026-04-01T14:00:00Z" });
  store.cancel(apt.id);
  expect(store.hasConflict("2026-04-01T14:00:00Z")).toBe(false);
});

test("countOnDate", () => {
  store.create({ name: "A", email: "a@e.com", scheduled_time: "2026-04-01T10:00:00Z" });
  store.create({ name: "B", email: "b@e.com", scheduled_time: "2026-04-01T14:00:00Z" });
  store.create({ name: "C", email: "c@e.com", scheduled_time: "2026-04-02T10:00:00Z" });
  expect(store.countOnDate("2026-04-01")).toBe(2);
  expect(store.countOnDate("2026-04-02")).toBe(1);
});

test("listPending returns only pending", () => {
  store.create({ name: "Pending", email: "p@e.com", scheduled_time: "2026-04-01T10:00:00Z" });
  const apt2 = store.create({ name: "Approved", email: "a@e.com", scheduled_time: "2026-04-01T14:00:00Z" });
  store.approve(apt2.id);
  const pending = store.listPending();
  expect(pending.length).toBe(1);
  expect(pending[0].name).toBe("Pending");
});

test("cancel works", () => {
  const apt = store.create({ name: "A", email: "a@e.com", scheduled_time: "2026-04-01T10:00:00Z" });
  const cancelled = store.cancel(apt.id);
  expect(cancelled!.status).toBe("cancelled");
});

test("reschedule moves time", () => {
  const apt = store.create({ name: "A", email: "a@e.com", scheduled_time: "2026-04-01T10:00:00Z" });
  const moved = store.reschedule(apt.id, "2026-04-02T10:00:00Z");
  expect(moved!.scheduled_time).toBe("2026-04-02T10:00:00Z");
});

test("preferences get/set", () => {
  expect(store.getPref("k")).toBeNull();
  store.setPref("k", "v");
  expect(store.getPref("k")).toBe("v");
});

test("unique IDs", () => {
  const a = store.create({ name: "A", email: "a@e.com", scheduled_time: "2026-04-01T10:00:00Z" });
  const b = store.create({ name: "B", email: "b@e.com", scheduled_time: "2026-04-01T14:00:00Z" });
  expect(a.id).not.toBe(b.id);
  expect(a.manage_token).not.toBe(b.manage_token);
});
