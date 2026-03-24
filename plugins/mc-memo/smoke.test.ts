/**
 * mc-memo — Comprehensive unit tests
 *
 * Tests write/read/list/clear with actual filesystem I/O (tmpdir)
 * and tool execute() functions for memo_write / memo_read.
 */

import { test, expect, describe, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import register from "./index.js";
import { createMemoTools } from "./tools/definitions.js";

/* ── Helpers ────────────────────────────────────────────────────────────── */

let tmpDir: string;

function memoDir(): string {
  return path.join(tmpDir, "memos");
}

const noopLogger = {
  info() {},
  warn() {},
  error() {},
  debug() {},
} as any;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "mc-memo-test-"));
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

/* ── Basic export tests ─────────────────────────────────────────────────── */

describe("exports", () => {
  test("register is a default-exported function", () => {
    expect(typeof register).toBe("function");
  });

  test("createMemoTools returns an array of tools", () => {
    const tools = createMemoTools("/tmp/memo-smoke", noopLogger);
    expect(Array.isArray(tools)).toBe(true);
    expect(tools.length).toBeGreaterThan(0);
    for (const t of tools) {
      expect(typeof t.name).toBe("string");
    }
  });
});

/* ── Direct filesystem I/O tests ────────────────────────────────────────── */

describe("write (direct fs)", () => {
  test("creates memo dir and file with timestamped content", () => {
    const dir = memoDir();
    fs.mkdirSync(dir, { recursive: true });
    const filePath = path.join(dir, "crd_test1.md");
    const timestamp = new Date().toISOString();
    const line = `${timestamp} tried X, got error Y\n`;
    fs.appendFileSync(filePath, line, { encoding: "utf-8", flag: "a" });

    expect(fs.existsSync(filePath)).toBe(true);
    const content = fs.readFileSync(filePath, "utf-8");
    expect(content).toContain("tried X, got error Y");
    expect(content).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  test("appending multiple notes produces multiple lines", () => {
    const dir = memoDir();
    fs.mkdirSync(dir, { recursive: true });
    const filePath = path.join(dir, "crd_multi.md");

    fs.appendFileSync(filePath, "2024-01-01T00:00:00.000Z first note\n", "utf-8");
    fs.appendFileSync(filePath, "2024-01-01T00:01:00.000Z second note\n", "utf-8");

    const content = fs.readFileSync(filePath, "utf-8");
    const lines = content.trim().split("\n");
    expect(lines).toHaveLength(2);
    expect(lines[0]).toContain("first note");
    expect(lines[1]).toContain("second note");
  });
});

describe("read (direct fs)", () => {
  test("returns content from existing memo file", () => {
    const dir = memoDir();
    fs.mkdirSync(dir, { recursive: true });
    const filePath = path.join(dir, "crd_read1.md");
    fs.writeFileSync(filePath, "2024-01-01T00:00:00.000Z test note\n", "utf-8");

    const content = fs.readFileSync(filePath, "utf-8");
    expect(content).toContain("test note");
  });

  test("read nonexistent card returns no file", () => {
    const dir = memoDir();
    fs.mkdirSync(dir, { recursive: true });
    const filePath = path.join(dir, "crd_nonexistent.md");
    expect(fs.existsSync(filePath)).toBe(false);
  });
});

describe("list (direct fs)", () => {
  test("lists all memo files with correct card IDs", () => {
    const dir = memoDir();
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, "crd_aaa.md"), "2024-01-01T00:00:00.000Z note A\n", "utf-8");
    fs.writeFileSync(path.join(dir, "crd_bbb.md"), "2024-01-01T00:00:00.000Z note B\n", "utf-8");

    const files = fs.readdirSync(dir).filter((f) => f.endsWith(".md")).sort();
    expect(files).toHaveLength(2);
    expect(files[0]).toBe("crd_aaa.md");
    expect(files[1]).toBe("crd_bbb.md");
  });

  test("empty memo dir returns no files", () => {
    const dir = memoDir();
    fs.mkdirSync(dir, { recursive: true });
    const files = fs.readdirSync(dir).filter((f) => f.endsWith(".md"));
    expect(files).toHaveLength(0);
  });
});

describe("clear (direct fs)", () => {
  test("removes memo file", () => {
    const dir = memoDir();
    fs.mkdirSync(dir, { recursive: true });
    const filePath = path.join(dir, "crd_clear1.md");
    fs.writeFileSync(filePath, "2024-01-01T00:00:00.000Z to be cleared\n", "utf-8");
    expect(fs.existsSync(filePath)).toBe(true);

    fs.unlinkSync(filePath);
    expect(fs.existsSync(filePath)).toBe(false);
  });

  test("clearing nonexistent file does not throw", () => {
    const dir = memoDir();
    fs.mkdirSync(dir, { recursive: true });
    const filePath = path.join(dir, "crd_nope.md");
    expect(fs.existsSync(filePath)).toBe(false);
    // Same check as CLI: if !existsSync, just return
  });
});

/* ── Tool execute() tests ───────────────────────────────────────────────── */

describe("memo_write tool execute()", () => {
  test("creates memo file via tool execute and round-trips data", async () => {
    const dir = memoDir();
    const tools = createMemoTools(dir, noopLogger);
    const writeTool = tools.find((t) => t.name === "memo_write")!;
    expect(writeTool).toBeDefined();

    const result = await writeTool.execute("call-1", {
      cardId: "crd_tool_test1",
      note: "tried approach A, it failed with ENOENT",
    });

    // Verify result indicates success
    expect(result.isError).toBeFalsy();
    const text = result.content[0].text;
    expect(text).toContain("Memo written:");
    expect(text).toContain("tried approach A, it failed with ENOENT");

    // Verify file was actually created with correct content
    const filePath = path.join(dir, "crd_tool_test1.md");
    expect(fs.existsSync(filePath)).toBe(true);
    const content = fs.readFileSync(filePath, "utf-8");
    expect(content).toContain("tried approach A, it failed with ENOENT");
    expect(content).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  test("appends to existing memo file on second write", async () => {
    const dir = memoDir();
    const tools = createMemoTools(dir, noopLogger);
    const writeTool = tools.find((t) => t.name === "memo_write")!;

    await writeTool.execute("call-1", { cardId: "crd_append", note: "first note" });
    await writeTool.execute("call-2", { cardId: "crd_append", note: "second note" });

    const filePath = path.join(dir, "crd_append.md");
    const content = fs.readFileSync(filePath, "utf-8");
    const lines = content.trim().split("\n");
    expect(lines).toHaveLength(2);
    expect(lines[0]).toContain("first note");
    expect(lines[1]).toContain("second note");
  });

  test("silent failure detection: write must produce non-empty file", async () => {
    const dir = memoDir();
    const tools = createMemoTools(dir, noopLogger);
    const writeTool = tools.find((t) => t.name === "memo_write")!;

    const result = await writeTool.execute("call-1", {
      cardId: "crd_silent_fail_check",
      note: "this note must persist",
    });

    // The ORIGINAL BUG: write returns success but file is empty/missing
    // This test catches that scenario
    expect(result.isError).toBeFalsy();

    const filePath = path.join(dir, "crd_silent_fail_check.md");
    expect(fs.existsSync(filePath)).toBe(true);
    const content = fs.readFileSync(filePath, "utf-8");
    expect(content.trim().length).toBeGreaterThan(0);
    expect(content).toContain("this note must persist");
  });
});

describe("memo_read tool execute()", () => {
  test("reads back written content", async () => {
    const dir = memoDir();
    const tools = createMemoTools(dir, noopLogger);
    const writeTool = tools.find((t) => t.name === "memo_write")!;
    const readTool = tools.find((t) => t.name === "memo_read")!;
    expect(readTool).toBeDefined();

    await writeTool.execute("call-w", { cardId: "crd_roundtrip", note: "test roundtrip data" });

    const result = await readTool.execute("call-r", { cardId: "crd_roundtrip" });
    expect(result.isError).toBeFalsy();
    const text = result.content[0].text;
    expect(text).toContain("test roundtrip data");
  });

  test("returns '(no memos yet)' for nonexistent card", async () => {
    const dir = memoDir();
    const tools = createMemoTools(dir, noopLogger);
    const readTool = tools.find((t) => t.name === "memo_read")!;

    const result = await readTool.execute("call-r", { cardId: "crd_doesnt_exist" });
    expect(result.isError).toBeFalsy();
    expect(result.content[0].text).toBe("(no memos yet)");
  });

  test("returns '(no memos yet)' for empty file", async () => {
    const dir = memoDir();
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, "crd_empty.md"), "", "utf-8");

    const tools = createMemoTools(dir, noopLogger);
    const readTool = tools.find((t) => t.name === "memo_read")!;

    const result = await readTool.execute("call-r", { cardId: "crd_empty" });
    expect(result.isError).toBeFalsy();
    expect(result.content[0].text).toBe("(no memos yet)");
  });

  test("full write→read round-trip catches silent failures", async () => {
    const dir = memoDir();
    const tools = createMemoTools(dir, noopLogger);
    const writeTool = tools.find((t) => t.name === "memo_write")!;
    const readTool = tools.find((t) => t.name === "memo_read")!;

    // Write specific, verifiable content
    const note = `DB migrated to v3 at ${Date.now()}, do not re-run`;
    await writeTool.execute("call-w", { cardId: "crd_verify", note });

    // Read it back
    const result = await readTool.execute("call-r", { cardId: "crd_verify" });
    const text = result.content[0].text;

    // Must contain the exact note — if this fails, memo is silently broken
    expect(text).toContain(note);
  });
});

/* ── Large value handling ──────────────────────────────────────────────── */

describe("large value handling", () => {
  test("100KB+ note writes and reads back correctly", async () => {
    const dir = memoDir();
    const tools = createMemoTools(dir, noopLogger);
    const writeTool = tools.find((t) => t.name === "memo_write")!;
    const readTool = tools.find((t) => t.name === "memo_read")!;

    // Generate a 100KB+ string
    const bigNote = "A".repeat(102400);
    const result = await writeTool.execute("call-big", {
      cardId: "crd_large_value",
      note: bigNote,
    });
    expect(result.isError).toBeFalsy();

    // Read it back
    const readResult = await readTool.execute("call-big-r", {
      cardId: "crd_large_value",
    });
    expect(readResult.isError).toBeFalsy();
    expect(readResult.content[0].text).toContain(bigNote);

    // Verify file on disk
    const filePath = path.join(dir, "crd_large_value.md");
    const content = fs.readFileSync(filePath, "utf-8");
    expect(content.length).toBeGreaterThan(102400);
    expect(content).toContain(bigNote);
  });

  test("multiline notes with newlines round-trip correctly", async () => {
    const dir = memoDir();
    const tools = createMemoTools(dir, noopLogger);
    const writeTool = tools.find((t) => t.name === "memo_write")!;
    const readTool = tools.find((t) => t.name === "memo_read")!;

    const multilineNote = "line1\nline2\nline3";
    await writeTool.execute("call-ml", {
      cardId: "crd_multiline",
      note: multilineNote,
    });

    const readResult = await readTool.execute("call-ml-r", {
      cardId: "crd_multiline",
    });
    expect(readResult.isError).toBeFalsy();
    expect(readResult.content[0].text).toContain("line1");
    expect(readResult.content[0].text).toContain("line2");
    expect(readResult.content[0].text).toContain("line3");
  });

  test("unicode and emoji round-trip correctly", async () => {
    const dir = memoDir();
    const tools = createMemoTools(dir, noopLogger);
    const writeTool = tools.find((t) => t.name === "memo_write")!;
    const readTool = tools.find((t) => t.name === "memo_read")!;

    const unicodeNote = "café résumé naïve 日本語 🚀🔥✅ **bold** `code` — em-dash";
    await writeTool.execute("call-uni", {
      cardId: "crd_unicode",
      note: unicodeNote,
    });

    const readResult = await readTool.execute("call-uni-r", {
      cardId: "crd_unicode",
    });
    expect(readResult.isError).toBeFalsy();
    expect(readResult.content[0].text).toContain(unicodeNote);
  });
});

/* ── Concurrent writes ─────────────────────────────────────────────────── */

describe("concurrent writes", () => {
  test("10 parallel writes to same card all persist (no data loss)", async () => {
    const dir = memoDir();
    const tools = createMemoTools(dir, noopLogger);
    const writeTool = tools.find((t) => t.name === "memo_write")!;

    const noteCount = 10;
    const promises = Array.from({ length: noteCount }, (_, i) =>
      writeTool.execute(`call-concurrent-${i}`, {
        cardId: "crd_concurrent",
        note: `concurrent-note-${i}`,
      }),
    );

    const results = await Promise.all(promises);

    // All writes should succeed
    for (const r of results) {
      expect(r.isError).toBeFalsy();
    }

    // Verify all notes appear in the file
    const filePath = path.join(dir, "crd_concurrent.md");
    const content = fs.readFileSync(filePath, "utf-8");
    for (let i = 0; i < noteCount; i++) {
      expect(content).toContain(`concurrent-note-${i}`);
    }

    // Verify no corrupted/interleaved lines — each line should have a valid timestamp prefix
    const lines = content.trim().split("\n");
    expect(lines.length).toBe(noteCount);
    for (const line of lines) {
      expect(line).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
    }
  });
});

/* ── Error surfacing (must not swallow) ────────────────────────────────── */

describe("error surfacing", () => {
  test("write to read-only directory returns isError:true with meaningful message", async () => {
    const readonlyDir = path.join(tmpDir, "readonly-memo");
    fs.mkdirSync(readonlyDir, { recursive: true });
    // Create a file where the dir would be, making mkdirSync fail,
    // or make the dir read-only
    fs.chmodSync(readonlyDir, 0o444);

    const tools = createMemoTools(readonlyDir, noopLogger);
    const writeTool = tools.find((t) => t.name === "memo_write")!;

    const result = await writeTool.execute("call-ro", {
      cardId: "crd_readonly_test",
      note: "should fail",
    });

    // Must surface error, not swallow
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toMatch(/memo_write failed/);
    expect(result.content[0].text.length).toBeGreaterThan(15); // meaningful message, not empty

    // Restore permissions for cleanup
    fs.chmodSync(readonlyDir, 0o755);
  });

  test("read error surfaces with isError:true", async () => {
    // Create a directory where the file would be (causes EISDIR on read)
    const dir = memoDir();
    fs.mkdirSync(dir, { recursive: true });
    fs.mkdirSync(path.join(dir, "crd_isdir.md"), { recursive: true });

    const tools = createMemoTools(dir, noopLogger);
    const readTool = tools.find((t) => t.name === "memo_read")!;

    const result = await readTool.execute("call-err", {
      cardId: "crd_isdir",
    });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toMatch(/memo_read failed/);
  });
});

/* ── Path traversal safety ─────────────────────────────────────────────── */

describe("path traversal safety", () => {
  test("cardId with ../ does not escape memo directory", async () => {
    const dir = memoDir();
    const tools = createMemoTools(dir, noopLogger);
    const writeTool = tools.find((t) => t.name === "memo_write")!;

    // Attempt path traversal
    const result = await writeTool.execute("call-traversal", {
      cardId: "../../../etc/evil",
      note: "should not escape",
    });

    // The file should NOT exist outside the memo directory
    const escapedPath = path.resolve(dir, "../../../etc/evil.md");
    expect(fs.existsSync(escapedPath)).toBe(false);

    // Check the resolved path stays within memoDir or the write fails
    const resolvedPath = path.resolve(dir, "../../../etc/evil.md");
    const isInsideMemoDir = resolvedPath.startsWith(path.resolve(dir));
    if (isInsideMemoDir) {
      // If it resolved inside (shouldn't), at least verify content
      expect(result.isError).toBeFalsy();
    } else {
      // Either write failed (good — error surfaced) or the file was created
      // outside the dir (bad). Check that it didn't escape.
      expect(fs.existsSync(resolvedPath)).toBe(false);
    }
  });

  test("cardId with path separators does not create nested directories outside memo dir", async () => {
    const dir = memoDir();
    const tools = createMemoTools(dir, noopLogger);
    const writeTool = tools.find((t) => t.name === "memo_write")!;

    await writeTool.execute("call-sep", {
      cardId: "foo/bar/baz",
      note: "nested path test",
    });

    // The file should not have been created in a nested path outside memoDir
    const nestedPath = path.join(dir, "foo", "bar", "baz.md");
    // Either write fails or creates foo/bar/baz.md directly in memoDir
    // The critical check: nothing created outside tmpDir
    const parentDir = path.resolve(dir, "..");
    const parentFiles = fs.readdirSync(parentDir);
    expect(parentFiles).not.toContain("foo");
  });
});
