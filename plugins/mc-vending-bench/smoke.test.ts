import { test, expect } from "vitest";
import register from "./index.ts";

test("default export is a function", () => {
  expect(typeof register).toBe("function");
});

test("plugin registers mc-vending-bench commands", () => {
  const commands: string[] = [];
  const mockProgram = {
    command: (name: string) => {
      commands.push(name);
      const sub = {
        description: () => sub,
        command: (n: string) => {
          commands.push(`${name}/${n}`);
          return {
            description: () => sub,
            option: () => sub,
            action: () => sub,
          };
        },
        option: () => sub,
        action: () => sub,
      };
      return sub;
    },
  };

  register({
    program: mockProgram as any,
    logger: { info: () => {}, warn: () => {}, error: () => {} },
    stateDir: "/tmp/test-openclaw",
    config: {},
  });

  expect(commands).toContain("mc-vending-bench");
});
