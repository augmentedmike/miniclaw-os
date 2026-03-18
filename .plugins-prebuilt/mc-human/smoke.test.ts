import { test, expect } from "vitest";
import register from "./index.js";

test("register is a function", () => {
  expect(typeof register).toBe("function");
});
