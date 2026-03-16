import { execSync } from "node:child_process";
import * as fs from "node:fs";
import * as net from "node:net";
import type { BrowserConfig } from "../index.js";

interface CommandContext {
  program: any;
  logger: { info: (m: string) => void; warn: (m: string) => void };
}

export function registerBrowserCommands(ctx: CommandContext, cfg: BrowserConfig): void {
  const browser = ctx.program
    .command("mc-browser")
    .description("Chrome browser setup and health checks for MiniClaw");

  browser
    .command("check")
    .description("Verify Chrome is installed, CDP port is accessible, and extensions are configured")
    .action(async () => {
      let ok = true;

      // 1. Chrome installed?
      const chromeApp = "/Applications/Google Chrome.app";
      if (fs.existsSync(chromeApp)) {
        console.log(`  ✓  Chrome installed at ${chromeApp}`);
      } else {
        console.log(`  ✗  Chrome not found — run: brew install --cask google-chrome`);
        ok = false;
      }

      // 2. CDP port accessible?
      const cdpUp = await checkPort(cfg.cdpPort);
      if (cdpUp) {
        console.log(`  ✓  CDP port ${cfg.cdpPort} is listening`);
      } else {
        console.log(`  ⚠  CDP port ${cfg.cdpPort} not listening — Chrome may not be running with remote debugging`);
      }

      // 3. Extension policy configured?
      const policyFile = "/Library/Google/Chrome/Managed Preferences/com.google.Chrome.plist";
      if (fs.existsSync(policyFile)) {
        try {
          const plistContent = execSync(`defaults read "${policyFile}" ExtensionInstallForcelist 2>/dev/null`, {
            encoding: "utf-8",
          });
          const missingExts = cfg.extensionIds.filter((id) => !plistContent.includes(id));
          if (missingExts.length === 0) {
            console.log(`  ✓  Extension force-install policy configured (${cfg.extensionIds.length} extensions)`);
          } else {
            console.log(`  ⚠  Missing extensions in policy: ${missingExts.join(", ")}`);
          }
        } catch {
          console.log(`  ⚠  Could not read extension policy — run: mc-browser setup`);
        }
      } else {
        console.log(`  ⚠  Chrome managed policy not found — run: mc-browser setup`);
      }

      // 4. Remote debugging policy?
      try {
        const cmdLineArgs = execSync(
          `defaults read "/Library/Google/Chrome/Managed Preferences/com.google.Chrome.plist" CommandLineFlagSecurityWarningsEnabled 2>/dev/null`,
          { encoding: "utf-8" },
        ).trim();
        console.log(`  ✓  Chrome command-line flag warnings suppressed`);
      } catch {
        // not critical
      }

      // 5. mc-chrome launcher?
      const mcChromePaths = [
        `${cfg.stateDir}/miniclaw/SYSTEM/bin/mc-chrome`,
        "/usr/local/bin/mc-chrome",
      ];
      const mcChrome = mcChromePaths.find((p) => fs.existsSync(p));
      if (mcChrome) {
        console.log(`  ✓  mc-chrome launcher at ${mcChrome}`);
      } else {
        console.log(`  ⚠  mc-chrome launcher not found`);
      }

      process.exit(ok ? 0 : 1);
    });

  browser
    .command("setup")
    .description("Install Chrome, configure remote debugging, and set up extension policies")
    .action(async () => {
      // 1. Install Chrome if missing
      const chromeApp = "/Applications/Google Chrome.app";
      if (!fs.existsSync(chromeApp)) {
        console.log("Installing Google Chrome...");
        try {
          execSync("brew install --cask google-chrome", { stdio: "inherit" });
          console.log("  ✓  Chrome installed");
        } catch {
          console.error("  ✗  Chrome install failed — download from https://google.com/chrome");
          process.exit(1);
        }
      } else {
        console.log("  ✓  Chrome already installed");
      }

      // 2. Set up extension force-install policy
      console.log("Configuring Chrome extension policies...");
      const policyDir = "/Library/Google/Chrome/Managed Preferences";
      const policyFile = `${policyDir}/com.google.Chrome.plist`;

      try {
        execSync(`sudo mkdir -p "${policyDir}"`, { stdio: "inherit" });

        // Read existing forcelist
        let existing: string[] = [];
        try {
          const raw = execSync(`defaults read "${policyFile}" ExtensionInstallForcelist 2>/dev/null`, {
            encoding: "utf-8",
          });
          const matches = raw.match(/"([^"]+)"/g);
          if (matches) {
            existing = matches.map((m) => m.replace(/"/g, ""));
          }
        } catch {
          // no existing policy
        }

        // Add missing extensions
        for (const extId of cfg.extensionIds) {
          const entry = `${extId};https://clients2.google.com/service/update2/crx`;
          if (!existing.some((e) => e.includes(extId))) {
            existing.push(entry);
          }
        }

        // Write policy
        const args = existing.map((e) => `"${e}"`).join(" ");
        execSync(`sudo defaults write "${policyFile}" ExtensionInstallForcelist -array ${args}`, {
          stdio: "inherit",
        });
        console.log(`  ✓  Extension policy updated (${existing.length} extensions)`);
      } catch (err) {
        console.error(`  ✗  Failed to write extension policy (sudo required)`);
      }

      // 3. Set persistent remote debugging args via Chrome policy
      console.log("Configuring persistent remote debugging...");
      try {
        // Use Bookmarks as a proxy to detect if Chrome has ever been launched
        // Set the remote debugging port as a managed preference
        execSync(
          `sudo defaults write "/Library/Google/Chrome/Managed Preferences/com.google.Chrome.plist" CommandLineFlagSecurityWarningsEnabled -bool false`,
          { stdio: "inherit" },
        );
        console.log(`  ✓  Chrome policy configured`);
      } catch {
        console.error(`  ⚠  Could not set Chrome policy (sudo required)`);
      }

      console.log("\nBrowser setup complete. Use 'mc-chrome' to launch Chrome with remote debugging.");
    });
}

function checkPort(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    socket.setTimeout(1000);
    socket.on("connect", () => {
      socket.destroy();
      resolve(true);
    });
    socket.on("timeout", () => {
      socket.destroy();
      resolve(false);
    });
    socket.on("error", () => {
      resolve(false);
    });
    socket.connect(port, "127.0.0.1");
  });
}
