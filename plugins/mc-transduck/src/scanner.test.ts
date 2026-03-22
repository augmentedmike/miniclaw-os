import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { scanPluginDirs } from "./scanner.js";

let tmpDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "mc-transduck-scan-"));
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

function writeFile(relPath: string, content: string) {
  const full = path.join(tmpDir, relPath);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, content, "utf-8");
}

describe("scanPluginDirs", () => {
  it("extracts simple ait() calls with double quotes", () => {
    writeFile("src/index.ts", `const msg = await ait("Hello world");`);
    const entries = scanPluginDirs([tmpDir]);
    expect(entries).toHaveLength(1);
    expect(entries[0].text).toBe("Hello world");
    expect(entries[0].context).toBeUndefined();
  });

  it("extracts ait() calls with single quotes", () => {
    writeFile("src/index.ts", `const msg = await ait('Goodbye');`);
    const entries = scanPluginDirs([tmpDir]);
    expect(entries).toHaveLength(1);
    expect(entries[0].text).toBe("Goodbye");
  });

  it("extracts ait() calls with backtick quotes", () => {
    writeFile("src/index.ts", "const msg = await ait(`Welcome back`);");
    const entries = scanPluginDirs([tmpDir]);
    expect(entries).toHaveLength(1);
    expect(entries[0].text).toBe("Welcome back");
  });

  it("extracts ait() calls with context argument (double quotes)", () => {
    writeFile(
      "src/index.ts",
      `const msg = await ait("Hello", "greeting context");`,
    );
    const entries = scanPluginDirs([tmpDir]);
    expect(entries).toHaveLength(1);
    expect(entries[0].text).toBe("Hello");
    expect(entries[0].context).toBe("greeting context");
  });

  it("extracts ait() calls with context argument (single quotes)", () => {
    writeFile(
      "src/index.ts",
      `const msg = await ait('Submit', 'button label');`,
    );
    const entries = scanPluginDirs([tmpDir]);
    expect(entries).toHaveLength(1);
    expect(entries[0].text).toBe("Submit");
    expect(entries[0].context).toBe("button label");
  });

  it("extracts multiple ait() calls from the same file", () => {
    writeFile(
      "src/index.ts",
      `
      const a = await ait("Hello");
      const b = await ait("Goodbye", "farewell");
      const c = await ait('Thanks');
      `,
    );
    const entries = scanPluginDirs([tmpDir]);
    expect(entries).toHaveLength(3);
    expect(entries.map((e) => e.text).sort()).toEqual(
      ["Goodbye", "Hello", "Thanks"].sort(),
    );
  });

  it("deduplicates identical strings across files", () => {
    writeFile("src/a.ts", `await ait("Hello");`);
    writeFile("src/b.ts", `await ait("Hello");`);
    const entries = scanPluginDirs([tmpDir]);
    expect(entries).toHaveLength(1);
    expect(entries[0].text).toBe("Hello");
    expect(entries[0].files).toHaveLength(2);
  });

  it("skips node_modules directories", () => {
    writeFile("node_modules/foo/index.ts", `await ait("Skip me");`);
    writeFile("src/index.ts", `await ait("Include me");`);
    const entries = scanPluginDirs([tmpDir]);
    expect(entries).toHaveLength(1);
    expect(entries[0].text).toBe("Include me");
  });

  it("only scans supported file extensions", () => {
    writeFile("src/data.json", `{"key": "ait(\\"Nope\\")"}`);
    writeFile("src/index.ts", `await ait("Yes");`);
    const entries = scanPluginDirs([tmpDir]);
    expect(entries).toHaveLength(1);
    expect(entries[0].text).toBe("Yes");
  });

  it("returns empty array for directory with no ait() calls", () => {
    writeFile("src/index.ts", `const x = 42;`);
    const entries = scanPluginDirs([tmpDir]);
    expect(entries).toHaveLength(0);
  });
});
