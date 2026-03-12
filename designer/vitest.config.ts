import { defineConfig } from "vitest/config";
import path from "node:path";

const openclaw = path.resolve(process.env.OPENCLAW_STATE_DIR ?? require("node:os").homedir() + "/.openclaw", "projects/openclaw");

export default defineConfig({
  resolve: {
    alias: {
      commander: path.join(openclaw, "node_modules/commander"),
      "openclaw/plugin-sdk": path.join(openclaw, "dist/plugin-sdk/index.js"),
    },
  },
  test: {
    include: ["**/*.test.ts"],
    exclude: ["**/node_modules/**"],
  },
});
