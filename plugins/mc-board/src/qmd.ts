import { spawnSync } from "node:child_process";

export class QmdClient {
  constructor(
    private readonly qmdBin: string,
    private readonly collection: string,
  ) {}

  index(id: string, text: string): void {
    try {
      spawnSync(this.qmdBin, ["write", "--collection", this.collection, "--id", id, "--text", text], {
        encoding: "utf-8",
        timeout: 5000,
      });
    } catch {
      // Non-fatal: QMD indexing failures don't block core functionality
    }
  }

  search(query: string, limit = 5): string[] {
    try {
      const result = spawnSync(
        this.qmdBin,
        ["search", "--collection", this.collection, "--query", query, "--limit", String(limit)],
        { encoding: "utf-8", timeout: 5000 },
      );
      if (result.status !== 0) return [];
      return (result.stdout ?? "").split("\n").filter(Boolean);
    } catch {
      return [];
    }
  }
}
