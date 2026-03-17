/**
 * model-routing.test.ts
 *
 * Unit tests for the before_model_resolve hook's session-type routing.
 * Verifies: messaging → Haiku, board-worker → Opus, other cron → Sonnet.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import register from "../index";

type HookHandler = (event: unknown, ctx: Record<string, unknown>) => Promise<unknown>;

function createMockApi(pluginConfig: Record<string, unknown> = {}) {
  const hooks = new Map<string, { handler: HookHandler; opts?: { priority?: number } }>();

  const api = {
    pluginConfig,
    config: {},
    logger: {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    },
    on: vi.fn((hookName: string, handler: HookHandler, opts?: { priority?: number }) => {
      hooks.set(hookName, { handler, opts });
    }),
    registerCommand: vi.fn(),
  };

  return { api, hooks };
}

describe("model routing — before_model_resolve", () => {
  let hooks: Map<string, { handler: HookHandler; opts?: { priority?: number } }>;
  let resolveModel: HookHandler;

  beforeEach(() => {
    const mock = createMockApi();
    register(mock.api as any);
    hooks = mock.hooks;
    const entry = hooks.get("before_model_resolve");
    if (!entry) throw new Error("before_model_resolve hook not registered");
    resolveModel = entry.handler;
  });

  it("routes TG DM sessions to Haiku", async () => {
    const result = await resolveModel({}, {
      sessionKey: "agent:main:telegram:direct:8755232806",
    });
    expect(result).toEqual({ model: "claude-haiku-4-5-20251001" });
  });

  it("routes TG group sessions to Haiku", async () => {
    const result = await resolveModel({}, {
      sessionKey: "agent:main:telegram:group:-5144217613",
    });
    expect(result).toEqual({ model: "claude-haiku-4-5-20251001" });
  });

  it("routes Discord sessions to Haiku", async () => {
    const result = await resolveModel({}, {
      sessionKey: "agent:main:discord:direct:12345",
    });
    expect(result).toEqual({ model: "claude-haiku-4-5-20251001" });
  });

  it("routes board-worker cron sessions to Opus", async () => {
    const result = await resolveModel({}, {
      sessionKey: "agent:main:cron:board-worker:abc-123",
    });
    expect(result).toEqual({ model: "claude-opus-4-6-20260315" });
  });

  it("routes non-board-worker cron sessions to Sonnet", async () => {
    const result = await resolveModel({}, {
      sessionKey: "agent:main:cron:71130727-triage",
    });
    expect(result).toEqual({ model: "claude-sonnet-4-6-20260315" });
  });

  it("returns undefined for main/CLI sessions (use default)", async () => {
    const result = await resolveModel({}, {
      sessionKey: "agent:main:main",
    });
    expect(result).toBeUndefined();
  });

  it("returns undefined for heartbeat sessions (use default)", async () => {
    const result = await resolveModel({}, {
      sessionKey: "agent:main:heartbeat:check",
    });
    expect(result).toBeUndefined();
  });

  it("sets hook priority to 50", () => {
    const entry = hooks.get("before_model_resolve");
    expect(entry?.opts?.priority).toBe(50);
  });
});

describe("model routing — custom model overrides via config", () => {
  it("uses custom model IDs from pluginConfig", async () => {
    const mock = createMockApi({
      haikuModel: "custom-haiku",
      sonnetModel: "custom-sonnet",
      opusModel: "custom-opus",
    });
    register(mock.api as any);

    const entry = mock.hooks.get("before_model_resolve");
    if (!entry) throw new Error("hook not registered");
    const resolveModel = entry.handler;

    // Chat → custom haiku
    const chat = await resolveModel({}, {
      sessionKey: "agent:main:telegram:direct:123",
    });
    expect(chat).toEqual({ model: "custom-haiku" });

    // Board worker → custom opus
    const coding = await resolveModel({}, {
      sessionKey: "agent:main:cron:board-worker:xyz",
    });
    expect(coding).toEqual({ model: "custom-opus" });

    // Cron → custom sonnet
    const planning = await resolveModel({}, {
      sessionKey: "agent:main:cron:some-triage-task",
    });
    expect(planning).toEqual({ model: "custom-sonnet" });
  });
});
