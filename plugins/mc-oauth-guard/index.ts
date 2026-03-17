/**
 * mc-oauth-guard — OpenClaw plugin
 *
 * Monitors OAuth token refresh failures, applies exponential backoff to prevent
 * retry storms, auto-disables failing OAuth profiles after N consecutive failures,
 * and attempts automatic recovery via macOS keychain re-import.
 *
 * Solves: https://github.com/augmentedmike/miniclaw-os/issues/157
 *   — Claude Code rotates the shared Anthropic refresh token, invalidating
 *     OpenClaw's copy and causing 95+ retry storms in gateway.err.log.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import type { OpenClawPluginApi } from "openclaw/plugin-sdk";
import {
  OAuthGuard,
  matchOAuthRefreshError,
  type GuardConfig,
} from "./src/guard.js";
import {
  readAnthropicKeychainCredentials,
  reimportKeychainCredentials,
} from "./src/keychain.js";

interface PluginConfig {
  enabled?: boolean;
  maxConsecutiveFailures?: number;
  minBackoffMs?: number;
  maxBackoffMs?: number;
  keychainRecovery?: boolean;
}

export default function register(api: OpenClawPluginApi): void {
  const cfg = (api.pluginConfig ?? {}) as PluginConfig;
  const enabled = cfg.enabled ?? true;

  if (!enabled) {
    api.logger.info("mc-oauth-guard loaded (disabled)");
    return;
  }

  const stateDir =
    (process.env.OPENCLAW_STATE_DIR ?? "").trim() ||
    path.join(os.homedir(), ".openclaw");

  const guardConfig: GuardConfig = {
    maxConsecutiveFailures: cfg.maxConsecutiveFailures ?? 3,
    minBackoffMs: cfg.minBackoffMs ?? 300_000, // 5 minutes
    maxBackoffMs: cfg.maxBackoffMs ?? 3_600_000, // 1 hour
    keychainRecovery: cfg.keychainRecovery ?? true,
    stateDir,
  };

  const guard = new OAuthGuard(guardConfig);
  const logFile = path.join(stateDir, "oauth-guard.log");

  const authProfilesPath = path.join(
    stateDir,
    "agents",
    "main",
    "agent",
    "auth-profiles.json",
  );

  function appendLog(level: string, msg: string): void {
    const line = `${new Date().toISOString()} [${level}] ${msg}\n`;
    try {
      fs.appendFileSync(logFile, line);
    } catch {
      // Best-effort
    }
  }

  /**
   * Find the OAuth profile ID for a given provider by reading auth-profiles.json.
   */
  function findOAuthProfileForProvider(provider: string): string | null {
    try {
      const raw = fs.readFileSync(authProfilesPath, "utf-8");
      const store = JSON.parse(raw);
      for (const [id, profile] of Object.entries(store.profiles ?? {})) {
        const p = profile as { type?: string; provider?: string };
        if (p.type === "oauth" && p.provider === provider) {
          return id;
        }
      }
    } catch {
      // File might not exist yet
    }
    return null;
  }

  /**
   * Disable a profile in auth-profiles.json by setting usageStats fields.
   */
  function disableProfileInStore(profileId: string, reason: string): boolean {
    try {
      const raw = fs.readFileSync(authProfilesPath, "utf-8");
      const store = JSON.parse(raw);

      if (!store.usageStats) store.usageStats = {};
      if (!store.usageStats[profileId]) {
        store.usageStats[profileId] = {};
      }

      store.usageStats[profileId].disabledUntil =
        Date.now() + guardConfig.maxBackoffMs;
      store.usageStats[profileId].disabledReason = reason;
      store.usageStats[profileId].cooldownUntil =
        Date.now() + guardConfig.maxBackoffMs;

      fs.writeFileSync(
        authProfilesPath,
        JSON.stringify(store, null, 2),
        "utf-8",
      );
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Attempt keychain recovery for an Anthropic OAuth profile.
   */
  function attemptKeychainRecovery(
    profileId: string,
    provider: string,
  ): boolean {
    if (!guardConfig.keychainRecovery) return false;
    if (provider !== "anthropic") return false;
    if (os.platform() !== "darwin") return false;

    const profileState = guard.getProfileState(profileId);
    if (profileState?.recoveryAttempted) return false;

    guard.markRecoveryAttempted(profileId);
    appendLog(
      "INFO",
      `Attempting keychain recovery for ${profileId} (${provider})`,
    );

    const reimported = reimportKeychainCredentials(
      authProfilesPath,
      profileId,
    );

    if (reimported) {
      appendLog(
        "INFO",
        `Keychain recovery successful for ${profileId} — fresh credentials imported`,
      );
      guard.resetProfile(profileId);
      return true;
    }

    appendLog(
      "WARN",
      `Keychain recovery failed for ${profileId} — no fresh credentials found`,
    );
    return false;
  }

  // --- Hook: agent_end — detect OAuth refresh failures ---
  api.on(
    "agent_end",
    async (event) => {
      if (!event.error) return;

      const match = matchOAuthRefreshError(event.error);
      if (!match) return;

      const { provider } = match;
      const profileId = findOAuthProfileForProvider(provider);
      if (!profileId) return;

      // Check if we're already blocking this profile
      const blockCheck = guard.shouldBlock(profileId);
      if (blockCheck.blocked) {
        appendLog(
          "DEBUG",
          `Suppressed duplicate failure for ${profileId} — already ${blockCheck.reason}`,
        );
        return;
      }

      // Record the failure
      const state = guard.recordFailure(profileId, provider);
      appendLog(
        "WARN",
        `OAuth refresh failure #${state.consecutiveFailures} for ${profileId} (${provider}). ` +
          `Next retry at ${new Date(state.nextRetryAt).toISOString()}`,
      );

      // Attempt keychain recovery before disabling
      if (
        state.consecutiveFailures >= guardConfig.maxConsecutiveFailures &&
        !state.recoveryAttempted
      ) {
        const recovered = attemptKeychainRecovery(profileId, provider);
        if (recovered) {
          api.logger.info(
            `mc-oauth-guard: recovered ${profileId} from keychain — reset failure count`,
          );
          return;
        }
      }

      // Auto-disable if threshold reached
      if (state.disabled) {
        const reason = `Auto-disabled after ${state.consecutiveFailures} consecutive OAuth refresh failures`;
        disableProfileInStore(profileId, reason);
        appendLog("ERROR", `${reason} for ${profileId} (${provider})`);
        api.logger.warn(
          `mc-oauth-guard: ${reason}. Re-authenticate with: openclaw models auth paste-token --provider ${provider}`,
        );
      }
    },
    { priority: 200 },
  );

  // --- Hook: before_model_resolve — block retries during backoff ---
  api.on(
    "before_model_resolve",
    async () => {
      // Check all tracked profiles for active backoff
      const states = guard.getAllStates();
      for (const [profileId, state] of Object.entries(states)) {
        const blockCheck = guard.shouldBlock(profileId);
        if (blockCheck.blocked && state.disabled) {
          appendLog(
            "DEBUG",
            `Blocked model resolve for disabled profile ${profileId}`,
          );
          // The core will fall through to lastGood profile automatically
        }
      }
    },
    { priority: 100 },
  );

  // --- CLI Commands ---

  api.registerCommand({
    name: "oauth_guard_status",
    description: "Show OAuth guard failure tracking status",
    acceptsArgs: false,
    handler: () => {
      const states = guard.getAllStates();
      const entries = Object.entries(states);

      if (entries.length === 0) {
        return { text: "*mc-oauth-guard:* No tracked failures. All OAuth profiles healthy." };
      }

      const lines = entries.map(([id, s]) => {
        const status = s.disabled
          ? "DISABLED"
          : Date.now() < s.nextRetryAt
            ? "BACKOFF"
            : "TRACKING";
        const nextRetry =
          Date.now() < s.nextRetryAt
            ? `next retry: ${new Date(s.nextRetryAt).toISOString()}`
            : "ready to retry";
        return (
          `  ${id} (${s.provider}): ${status}\n` +
          `    failures: ${s.consecutiveFailures}, ${nextRetry}\n` +
          `    recovery attempted: ${s.recoveryAttempted}`
        );
      });

      return {
        text:
          `*mc-oauth-guard status*\n` +
          `Tracked profiles: ${entries.length}\n` +
          `Max failures before disable: ${guardConfig.maxConsecutiveFailures}\n` +
          `Backoff range: ${guardConfig.minBackoffMs / 1000}s – ${guardConfig.maxBackoffMs / 1000}s\n\n` +
          lines.join("\n\n"),
      };
    },
  });

  api.registerCommand({
    name: "oauth_guard_reset",
    description:
      "Reset OAuth guard failure state for a profile (usage: oauth_guard_reset <profileId>)",
    acceptsArgs: true,
    handler: (args) => {
      const profileId = (args as string)?.trim();
      if (!profileId) {
        guard.resetAll();
        return { text: "*mc-oauth-guard:* All failure states reset." };
      }

      guard.resetProfile(profileId);
      return {
        text: `*mc-oauth-guard:* Reset failure state for '${profileId}'.`,
      };
    },
  });

  api.registerCommand({
    name: "oauth_guard_recover",
    description:
      "Attempt keychain recovery for Anthropic OAuth (usage: oauth_guard_recover [profileId])",
    acceptsArgs: true,
    handler: (args) => {
      const profileId = ((args as string)?.trim()) ||
        findOAuthProfileForProvider("anthropic");

      if (!profileId) {
        return {
          text: "*mc-oauth-guard:* No Anthropic OAuth profile found in auth-profiles.json.",
        };
      }

      // Reset recovery flag so we can try again
      const ps = guard.getProfileState(profileId);
      if (ps) ps.recoveryAttempted = false;

      const recovered = attemptKeychainRecovery(profileId, "anthropic");
      if (recovered) {
        return {
          text: `*mc-oauth-guard:* Successfully recovered credentials for '${profileId}' from keychain.`,
        };
      }

      return {
        text:
          `*mc-oauth-guard:* Could not recover credentials for '${profileId}'. ` +
          `Manual re-auth required: openclaw models auth paste-token --provider anthropic`,
      };
    },
  });

  api.logger.info(
    `mc-oauth-guard loaded — monitoring OAuth refresh failures ` +
      `(threshold=${guardConfig.maxConsecutiveFailures}, ` +
      `backoff=${guardConfig.minBackoffMs / 1000}s–${guardConfig.maxBackoffMs / 1000}s, ` +
      `keychainRecovery=${guardConfig.keychainRecovery})`,
  );
}
