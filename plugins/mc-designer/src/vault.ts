import { execSync, spawnSync } from "node:child_process";
import * as readline from "node:readline";
import * as os from "node:os";
import * as path from "node:path";

const VAULT_KEY = "gemini-api-key";

function resolveBin(bin: string): string {
  if (bin.startsWith("~/")) return path.join(os.homedir(), bin.slice(2));
  return bin;
}

/**
 * Read the Gemini API key from the vault. Returns empty string if not found.
 */
export function readApiKeyFromVault(vaultBin: string): string {
  try {
    const bin = resolveBin(vaultBin);
    const result = execSync(`"${bin}" export ${VAULT_KEY}`, {
      encoding: "utf8",
      stdio: ["pipe", "pipe", "pipe"],
    });
    return result.trim();
  } catch {
    return "";
  }
}

/**
 * Prompt the user for a Gemini API key, vault it, and return it.
 * Called when no key is configured or when a 403 is received.
 */
export async function promptAndVaultKey(vaultBin: string): Promise<string> {
  const bin = resolveBin(vaultBin);

  process.stdout.write("\n  Gemini API key required.\n");
  process.stdout.write("  Get a free key at: https://aistudio.google.com/app/apikey\n");
  process.stdout.write("  API key (input hidden): ");

  const key = await readHidden();

  if (!key) {
    process.stdout.write("  No key entered — aborting.\n\n");
    return "";
  }

  try {
    spawnSync(bin, ["set", VAULT_KEY, key], { stdio: "pipe" });
    process.stdout.write(`  Key saved to vault as "${VAULT_KEY}"\n\n`);
  } catch (e) {
    process.stderr.write(`  Warning: failed to save key to vault: ${e}\n`);
  }

  return key;
}

function readHidden(): Promise<string> {
  return new Promise((resolve) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      terminal: true,
    });

    // Suppress echo by overriding _writeToOutput
    (rl as any)._writeToOutput = (s: string) => {
      if (s === "\n" || s === "\r\n") process.stdout.write("\n");
      // swallow all other output (the typed characters)
    };

    rl.question("", (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

export function isAuthError(err: unknown): boolean {
  const msg = String(err);
  return msg.includes("403") || msg.includes("Forbidden") || msg.includes("API_KEY") || msg.includes("identity");
}
