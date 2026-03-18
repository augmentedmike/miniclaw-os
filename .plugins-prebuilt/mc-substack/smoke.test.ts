import { test, expect } from "vitest";
import register from "./index.js";

test("register is a default-exported function", () => {
  expect(typeof register).toBe("function");
});
