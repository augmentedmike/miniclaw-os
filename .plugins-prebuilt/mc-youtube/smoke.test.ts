import { test, expect } from "vitest";
import { resolveConfig } from "./src/config.js";
import type { YoutubeConfig } from "./src/config.js";

test("resolveConfig returns a valid YoutubeConfig", () => {
  const cfg = resolveConfig({});
  expect(typeof cfg.mediaDir).toBe("string");
  expect(typeof cfg.maxKeyPoints).toBe("number");
  expect(typeof cfg.claudeBin).toBe("string");
  expect(typeof cfg.screenshotWidth).toBe("number");
  expect(typeof cfg.screenshotQuality).toBe("number");
  expect(typeof cfg.keyframeIntervalSeconds).toBe("number");
});

test("resolveConfig respects overrides", () => {
  const cfg = resolveConfig({ maxKeyPoints: 20, screenshotWidth: 1920 });
  expect(cfg.maxKeyPoints).toBe(20);
  expect(cfg.screenshotWidth).toBe(1920);
});
