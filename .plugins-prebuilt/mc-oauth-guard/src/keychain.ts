/**
 * macOS Keychain recovery for Anthropic OAuth tokens.
 *
 * Claude Code stores its OAuth credentials in the macOS keychain.
 * This module reads them and can re-import them into auth-profiles.json
 * when the stored refresh token becomes stale.
 */

import { execSync } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";

export interface KeychainCredential {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
}

/**
 * Attempt to read Claude Code's OAuth credentials from macOS keychain.
 * Claude Code stores them under the service name "claude.ai" or
 * "com.anthropic.claude" in the login keychain.
 */
export function readAnthropicKeychainCredentials(): KeychainCredential | null {
  if (os.platform() !== "darwin") return null;

  // Claude Code stores OAuth data in its config directory
  const claudeConfigPaths = [
    path.join(os.homedir(), ".claude", "oauth_credentials.json"),
    path.join(os.homedir(), ".config", "claude", "oauth_credentials.json"),
    path.join(
      os.homedir(),
      "Library",
      "Application Support",
      "Claude",
      "oauth_credentials.json",
    ),
  ];

  for (const configPath of claudeConfigPaths) {
    try {
      if (!fs.existsSync(configPath)) continue;
      const raw = fs.readFileSync(configPath, "utf-8");
      const data = JSON.parse(raw);

      // Claude Code credential format
      if (data.access_token && data.refresh_token) {
        return {
          accessToken: data.access_token,
          refreshToken: data.refresh_token,
          expiresAt: data.expires_at ?? Date.now() + 3600_000,
        };
      }

      // Nested format under "anthropic" key
      if (data.anthropic?.access_token && data.anthropic?.refresh_token) {
        return {
          accessToken: data.anthropic.access_token,
          refreshToken: data.anthropic.refresh_token,
          expiresAt: data.anthropic.expires_at ?? Date.now() + 3600_000,
        };
      }
    } catch {
      continue;
    }
  }

  // Try macOS keychain — Claude Code stores credentials here
  try {
    const result = execSync(
      'security find-generic-password -s "Claude Code-credentials" -w 2>/dev/null',
      { encoding: "utf-8", timeout: 5000 },
    ).trim();

    if (result) {
      try {
        const parsed = JSON.parse(result);
        // Claude Code stores under claudeAiOauth
        const oauth = parsed.claudeAiOauth ?? parsed;
        if (oauth.accessToken && oauth.refreshToken) {
          return {
            accessToken: oauth.accessToken,
            refreshToken: oauth.refreshToken,
            expiresAt: oauth.expiresAt ?? Date.now() + 3600_000,
          };
        }
        // Fallback: snake_case format
        if (oauth.access_token && oauth.refresh_token) {
          return {
            accessToken: oauth.access_token,
            refreshToken: oauth.refresh_token,
            expiresAt: oauth.expires_at ?? Date.now() + 3600_000,
          };
        }
      } catch {
        // Keychain value wasn't JSON
      }
    }
  } catch {
    // security command failed — keychain access denied or not available
  }

  return null;
}

/**
 * Re-import keychain credentials into auth-profiles.json.
 * Returns true if credentials were found and differ from current ones.
 */
export function reimportKeychainCredentials(
  authProfilesPath: string,
  profileId: string,
): boolean {
  const creds = readAnthropicKeychainCredentials();
  if (!creds) return false;
  if (!creds.refreshToken) return false;

  try {
    const raw = fs.readFileSync(authProfilesPath, "utf-8");
    const store = JSON.parse(raw);
    const profile = store.profiles?.[profileId];

    if (!profile || profile.type !== "oauth") return false;

    // Only reimport if the refresh token actually differs
    if (profile.refresh === creds.refreshToken) return false;

    // Update the profile with fresh credentials
    profile.access = creds.accessToken;
    profile.refresh = creds.refreshToken;
    profile.expires = creds.expiresAt;

    // Reset usage stats for this profile
    if (store.usageStats?.[profileId]) {
      store.usageStats[profileId].errorCount = 0;
      delete store.usageStats[profileId].cooldownUntil;
      delete store.usageStats[profileId].disabledUntil;
      delete store.usageStats[profileId].disabledReason;
    }

    fs.writeFileSync(authProfilesPath, JSON.stringify(store, null, 2), "utf-8");
    return true;
  } catch {
    return false;
  }
}
