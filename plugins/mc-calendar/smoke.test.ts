import { test, expect } from "vitest";
import register from "./index.js";
import { createCalendarTools } from "./tools/definitions.js";

test("register is a default-exported function", () => {
  expect(typeof register).toBe("function");
});

test("createCalendarTools returns an array of tools", () => {
  const cfg = {
    defaultCalendar: "",
    helperBin: "/tmp/calendar-helper",
    pluginDir: "/tmp/mc-calendar",
  };
  const tools = createCalendarTools(cfg, { info() {}, warn() {}, error() {}, debug() {} } as any);
  expect(Array.isArray(tools)).toBe(true);
  expect(tools.length).toBe(7);
  for (const t of tools) {
    expect(typeof t.name).toBe("string");
    expect(t.name).toMatch(/^calendar_/);
  }
});
