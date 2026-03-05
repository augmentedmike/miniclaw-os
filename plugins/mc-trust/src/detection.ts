/**
 * mc-trust detection module
 *
 * Detects hostile actor signals:
 * - Injection patterns (prompt injection attempts)
 * - Rapid-fire messages from unknown senders
 * - Repeated tool-error inducing messages
 * - Exfiltration patterns (asking for system files, prompts, etc.)
 */

import * as fs from "node:fs";
import * as path from "node:path";

export interface TrustLists {
  whitelist: WhitelistEntry[];
  blacklist: BlacklistEntry[];
  flags: FlagEntry[];
  injectionPatterns: string[];
  config: DetectionConfig;
}

export interface WhitelistEntry {
  id: string;
  name: string;
  addedAt: string;
  reason?: string;
}

export interface BlacklistEntry {
  id: string;
  name: string;
  addedAt: string;
  reason?: string;
  expiresAt?: string;
}

export interface FlagEntry {
  id: string;
  userId: string;
  signal: "injection" | "rapid-fire" | "tool-error" | "exfiltration";
  message: string;
  flaggedAt: string;
  count: number; // how many times this signal has been seen
}

export interface DetectionConfig {
  rapidFireThreshold: number; // messages per window
  rapidFireWindow: number; // seconds
  autoFlagThreshold: number; // flag count before auto-blacklist
  reportingEnabled: boolean;
  reportingChannel: string; // "telegram", "log", etc.
}

export interface DetectionResult {
  isBlacklisted: boolean;
  isFlagged: boolean;
  signals: DetectionSignal[];
  shouldAutoBlacklist: boolean;
}

export interface DetectionSignal {
  type: "injection" | "rapid-fire" | "tool-error" | "exfiltration";
  message: string;
  severity: "low" | "medium" | "high";
}

/**
 * Load trust lists from file
 */
export function loadLists(trustDir: string): TrustLists {
  const listPath = path.join(trustDir, "lists.json");
  try {
    const data = fs.readFileSync(listPath, "utf8");
    return JSON.parse(data);
  } catch {
    return getDefaultLists();
  }
}

/**
 * Save trust lists to file
 */
export function saveLists(trustDir: string, lists: TrustLists): void {
  const listPath = path.join(trustDir, "lists.json");
  fs.mkdirSync(trustDir, { recursive: true });
  fs.writeFileSync(listPath, JSON.stringify(lists, null, 2), "utf8");
}

/**
 * Get default (empty) lists
 */
function getDefaultLists(): TrustLists {
  return {
    whitelist: [],
    blacklist: [],
    flags: [],
    injectionPatterns: [
      "ignore previous",
      "pretend you are",
      "pretend you're",
      "you are now",
      "you're now",
      "forget all",
      "disregard all",
      "jailbreak",
      "DAN",
      "act as if",
      "roleplay",
      "system prompt",
      "SOUL.md",
      "env vars",
      "AGENTS.md",
      "memory.md",
    ],
    config: {
      rapidFireThreshold: 10,
      rapidFireWindow: 300, // 5 min
      autoFlagThreshold: 3,
      reportingEnabled: true,
      reportingChannel: "telegram",
    },
  };
}

/**
 * Check if a user is whitelisted
 */
export function isWhitelisted(lists: TrustLists, userId: string): boolean {
  return lists.whitelist.some((entry) => entry.id === userId);
}

/**
 * Check if a user is blacklisted
 */
export function isBlacklisted(lists: TrustLists, userId: string): boolean {
  const entry = lists.blacklist.find((e) => e.id === userId);
  if (!entry) return false;

  // Check if blacklist has expired
  if (entry.expiresAt) {
    const expiresAt = new Date(entry.expiresAt).getTime();
    if (Date.now() > expiresAt) {
      return false; // Expired, no longer blacklisted
    }
  }

  return true;
}

/**
 * Detect injection patterns in a message
 */
function detectInjectionPatterns(
  message: string,
  patterns: string[]
): DetectionSignal | null {
  const lowerMsg = message.toLowerCase();

  for (const pattern of patterns) {
    if (lowerMsg.includes(pattern.toLowerCase())) {
      return {
        type: "injection",
        message: `Detected injection pattern: "${pattern}"`,
        severity: "high",
      };
    }
  }

  return null;
}

/**
 * Detect rapid-fire messages from a user
 * (requires caller to track message timestamps per user)
 */
function detectRapidFire(
  config: DetectionConfig,
  recentMessageCount: number
): DetectionSignal | null {
  if (recentMessageCount > config.rapidFireThreshold) {
    return {
      type: "rapid-fire",
      message: `${recentMessageCount} messages in ${config.rapidFireWindow}s (threshold: ${config.rapidFireThreshold})`,
      severity: "medium",
    };
  }

  return null;
}

/**
 * Detect exfiltration patterns (asking for sensitive files/data)
 */
function detectExfiltration(message: string): DetectionSignal | null {
  const exfilPatterns = [
    "system prompt",
    "SOUL.md",
    "AGENTS.md",
    "MEMORY.md",
    "IDENTITY.md",
    "env vars",
    "environment variables",
    "api key",
    "secret",
    "password",
    "vault",
    "private key",
    "secret token",
  ];

  const lowerMsg = message.toLowerCase();
  for (const pattern of exfilPatterns) {
    if (lowerMsg.includes(pattern.toLowerCase())) {
      return {
        type: "exfiltration",
        message: `Detected exfiltration pattern: "${pattern}"`,
        severity: "high",
      };
    }
  }

  return null;
}

/**
 * Run detection on an incoming message
 *
 * Returns:
 * - Detection result (blacklisted, flagged, signals)
 * - Updated lists if new flags were added
 */
export function detectMessage(
  lists: TrustLists,
  userId: string,
  message: string,
  recentMessageCount: number = 0
): [DetectionResult, TrustLists] {
  const result: DetectionResult = {
    isBlacklisted: isBlacklisted(lists, userId),
    isFlagged: false,
    signals: [],
    shouldAutoBlacklist: false,
  };

  if (result.isBlacklisted) {
    return [result, lists];
  }

  // Check for injection patterns
  const injectionSignal = detectInjectionPatterns(
    message,
    lists.injectionPatterns
  );
  if (injectionSignal) {
    result.signals.push(injectionSignal);
  }

  // Check for exfiltration patterns
  const exfilSignal = detectExfiltration(message);
  if (exfilSignal) {
    result.signals.push(exfilSignal);
  }

  // Check for rapid-fire
  const rapidFireSignal = detectRapidFire(lists.config, recentMessageCount);
  if (rapidFireSignal) {
    result.signals.push(rapidFireSignal);
  }

  // If signals detected, flag the user
  if (result.signals.length > 0) {
    result.isFlagged = true;

    // Add or update flag
    const existingFlag = lists.flags.find(
      (f) => f.userId === userId && f.signal === result.signals[0].type
    );
    if (existingFlag) {
      existingFlag.count += 1;
      existingFlag.flaggedAt = new Date().toISOString();

      // Auto-blacklist if threshold exceeded
      if (
        existingFlag.count >= lists.config.autoFlagThreshold &&
        !isWhitelisted(lists, userId)
      ) {
        result.shouldAutoBlacklist = true;

        // Add to blacklist
        lists.blacklist.push({
          id: userId,
          name: `auto-flagged-${userId}`,
          addedAt: new Date().toISOString(),
          reason: `Auto-blacklisted after ${existingFlag.count} ${existingFlag.signal} signals`,
          expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(), // 7 days
        });
      }
    } else {
      lists.flags.push({
        id: `flag-${userId}-${Date.now()}`,
        userId,
        signal: result.signals[0].type,
        message: result.signals[0].message,
        flaggedAt: new Date().toISOString(),
        count: 1,
      });
    }
  }

  return [result, lists];
}

/**
 * Add a user to the whitelist
 */
export function addWhitelist(
  lists: TrustLists,
  userId: string,
  name: string,
  reason?: string
): TrustLists {
  // Remove from blacklist if present
  lists.blacklist = lists.blacklist.filter((e) => e.id !== userId);

  // Add to whitelist (no duplicates)
  if (!lists.whitelist.some((e) => e.id === userId)) {
    lists.whitelist.push({
      id: userId,
      name,
      addedAt: new Date().toISOString(),
      reason,
    });
  }

  return lists;
}

/**
 * Add a user to the blacklist
 */
export function addBlacklist(
  lists: TrustLists,
  userId: string,
  name: string,
  reason?: string,
  durationMs?: number
): TrustLists {
  // Remove from whitelist if present
  lists.whitelist = lists.whitelist.filter((e) => e.id !== userId);

  // Add to blacklist (no duplicates)
  if (!lists.blacklist.some((e) => e.id === userId)) {
    const entry: BlacklistEntry = {
      id: userId,
      name,
      addedAt: new Date().toISOString(),
      reason,
    };

    if (durationMs) {
      entry.expiresAt = new Date(Date.now() + durationMs).toISOString();
    }

    lists.blacklist.push(entry);
  }

  return lists;
}

/**
 * Remove a user from the blacklist
 */
export function removeBlacklist(lists: TrustLists, userId: string): TrustLists {
  lists.blacklist = lists.blacklist.filter((e) => e.id !== userId);
  return lists;
}

/**
 * Get user's trust record (summary)
 */
export function getUserTrustRecord(
  lists: TrustLists,
  userId: string
): {
  id: string;
  status: "whitelisted" | "blacklisted" | "flagged" | "unknown";
  flags: FlagEntry[];
  blacklistEntry?: BlacklistEntry;
  whitelistEntry?: WhitelistEntry;
} {
  const whitelistEntry = lists.whitelist.find((e) => e.id === userId);
  const blacklistEntry = lists.blacklist.find((e) => e.id === userId);
  const userFlags = lists.flags.filter((f) => f.userId === userId);

  let status: "whitelisted" | "blacklisted" | "flagged" | "unknown" =
    "unknown";
  if (whitelistEntry) {
    status = "whitelisted";
  } else if (isBlacklisted(lists, userId)) {
    status = "blacklisted";
  } else if (userFlags.length > 0) {
    status = "flagged";
  }

  return {
    id: userId,
    status,
    flags: userFlags,
    blacklistEntry,
    whitelistEntry,
  };
}
