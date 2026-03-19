#!/usr/bin/env node
/**
 * mc-kb postinstall — ensure embedding model is available.
 *
 * Downloads EmbeddingGemma-300M Q8_0 GGUF from HuggingFace if missing.
 * Runs automatically after `npm install`.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { execFileSync } from "node:child_process";

const MODEL_DIR = path.join(os.homedir(), ".cache", "qmd", "models");
const MODEL_FILE = "hf_ggml-org_embeddinggemma-300M-Q8_0.gguf";
const MODEL_PATH = path.join(MODEL_DIR, MODEL_FILE);
const MODEL_URL =
  "https://huggingface.co/ggml-org/embeddinggemma-300M-GGUF/resolve/main/embeddinggemma-300M-Q8_0.gguf";
const EXPECTED_SIZE = 300_000_000; // ~300MB minimum to detect bad downloads

if (fs.existsSync(MODEL_PATH)) {
  const stat = fs.statSync(MODEL_PATH);
  if (stat.size > EXPECTED_SIZE) {
    console.log(`[mc-kb] Embedding model already present (${(stat.size / 1e6).toFixed(0)}MB)`);
    process.exit(0);
  }
  // File exists but too small — probably a failed/corrupt download, remove and retry
  fs.unlinkSync(MODEL_PATH);
}

fs.mkdirSync(MODEL_DIR, { recursive: true });
console.log(`[mc-kb] Downloading EmbeddingGemma-300M Q8_0 (~313MB)...`);

try {
  execFileSync("curl", ["-fSL", "--progress-bar", "-o", MODEL_PATH, MODEL_URL], {
    stdio: ["ignore", "inherit", "inherit"],
    timeout: 600_000, // 10 min
  });

  const stat = fs.statSync(MODEL_PATH);
  if (stat.size < EXPECTED_SIZE) {
    fs.unlinkSync(MODEL_PATH);
    throw new Error(`Download too small: ${stat.size} bytes`);
  }

  console.log(`[mc-kb] Embedding model saved to ${MODEL_PATH}`);
} catch (err) {
  if (fs.existsSync(MODEL_PATH)) fs.unlinkSync(MODEL_PATH);
  console.warn(`[mc-kb] Failed to download embedding model: ${err.message}`);
  console.warn(`[mc-kb] Vector search will be disabled. To fix, manually download:`);
  console.warn(`[mc-kb]   curl -fSL -o "${MODEL_PATH}" "${MODEL_URL}"`);
  // Non-fatal — don't fail the install
  process.exit(0);
}
