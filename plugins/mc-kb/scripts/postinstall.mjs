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
import * as https from "node:https";

const MODEL_DIR = path.join(os.homedir(), ".cache", "qmd", "models");
const MODEL_FILE = "hf_ggml-org_embeddinggemma-300M-Q8_0.gguf";
const MODEL_PATH = path.join(MODEL_DIR, MODEL_FILE);
const MODEL_URL =
  "https://huggingface.co/ggml-org/embeddinggemma-300M-GGUF/resolve/main/embeddinggemma-300M-Q8_0.gguf";
const EXPECTED_SIZE_MB = 300; // rough minimum to detect bad downloads

if (fs.existsSync(MODEL_PATH)) {
  const stat = fs.statSync(MODEL_PATH);
  if (stat.size > EXPECTED_SIZE_MB * 1e6) {
    console.log(`[mc-kb] Embedding model already present (${(stat.size / 1e6).toFixed(0)}MB)`);
    process.exit(0);
  }
  // File exists but too small — probably a failed download, remove and retry
  fs.unlinkSync(MODEL_PATH);
}

fs.mkdirSync(MODEL_DIR, { recursive: true });
console.log(`[mc-kb] Downloading EmbeddingGemma-300M Q8_0 (~313MB)...`);

function download(url, dest) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest);
    https
      .get(url, (res) => {
        // Follow redirects
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          file.close();
          fs.unlinkSync(dest);
          return resolve(download(res.headers.location, dest));
        }
        if (res.statusCode !== 200) {
          file.close();
          fs.unlinkSync(dest);
          return reject(new Error(`HTTP ${res.statusCode}`));
        }

        const total = parseInt(res.headers["content-length"] || "0", 10);
        let downloaded = 0;
        let lastLog = 0;

        res.on("data", (chunk) => {
          downloaded += chunk.length;
          const now = Date.now();
          if (total && now - lastLog > 3000) {
            const pct = ((downloaded / total) * 100).toFixed(0);
            console.log(`[mc-kb]   ${pct}% (${(downloaded / 1e6).toFixed(0)}MB / ${(total / 1e6).toFixed(0)}MB)`);
            lastLog = now;
          }
        });

        res.pipe(file);
        file.on("finish", () => {
          file.close();
          const stat = fs.statSync(dest);
          if (stat.size < EXPECTED_SIZE_MB * 1e6) {
            fs.unlinkSync(dest);
            reject(new Error(`Download too small: ${stat.size} bytes`));
          } else {
            resolve();
          }
        });
      })
      .on("error", (err) => {
        file.close();
        if (fs.existsSync(dest)) fs.unlinkSync(dest);
        reject(err);
      });
  });
}

try {
  await download(MODEL_URL, MODEL_PATH);
  console.log(`[mc-kb] Embedding model saved to ${MODEL_PATH}`);
} catch (err) {
  console.warn(`[mc-kb] Failed to download embedding model: ${err.message}`);
  console.warn(`[mc-kb] Vector search will be disabled. To fix, manually download:`);
  console.warn(`[mc-kb]   curl -L -o "${MODEL_PATH}" "${MODEL_URL}"`);
  // Non-fatal — don't fail the install
  process.exit(0);
}
