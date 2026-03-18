import { test, expect } from "vitest";
import register from "./index.js";
import { createBlogTools } from "./tools/definitions.js";
import { registerBlogCommands } from "./cli/commands.js";

test("register is a function", () => {
  expect(typeof register).toBe("function");
});

test("createBlogTools returns an array", () => {
  const tools = createBlogTools(
    {
      postsDir: "/tmp/test/posts",
      addendumDir: "/tmp/test/addendums",
      voiceRulesPath: null,
      arcPlanPath: null,
      defaultAuthor: "Test",
      blogUrl: null,
      languages: ["en"],
    },
    { info: () => {}, warn: () => {}, error: () => {}, debug: () => {} } as any,
  );
  expect(Array.isArray(tools)).toBe(true);
});

test("registerBlogCommands is a function", () => {
  expect(typeof registerBlogCommands).toBe("function");
});
