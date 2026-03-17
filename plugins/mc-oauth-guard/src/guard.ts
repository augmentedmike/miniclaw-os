/**
 * OAuth Guard — core failure tracking and backoff logic.
 *
 * Monitors OAuth refresh failures per profile, applies exponential backoff,
 * and auto-disables profiles that exceed the failure threshold.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";

export interface GuardConfig {
  maxConsecutiveFailures: number;
  minBackoffMs: number;
  maxBackoffMs: number;
  keychainRecovery: boolean;
  stateDir: string;
}

export interface ProfileFailureState {
  profileId: string;
  provider: string;
  consecutiveFailures: number;
  firstFailureAt: number;
  lastFailureAt: number;
  nextRetryAt: number;
  disabled: boolean;
  disabledAt?: number;
  recoveryAttempted: boolean;
}

export interface GuardState {
  profiles: Record<string, ProfileFailureState>;
  lastUpdated: number;
}

const OAUTH_REFRESH_ERROR_PATTERN =
  /OAuth token refresh failed for (\w+)/;

export function matchOAuthRefreshError(
  errorMsg: string,
): { provider: string } | null {
  const m = OAUTH_REFRESH_ERROR_PATTERN.exec(errorMsg);
  return m ? { provider: m[1] } : null;
}

export function computeBackoff(
  failures: number,
  minMs: number,
  maxMs: number,
): number {
  // Exponential backoff: min * 2^(failures-1), capped at max
  const delay = minMs * Math.pow(2, Math.max(0, failures - 1));
  return Math.min(delay, maxMs);
}

export function isInBackoff(state: ProfileFailureState): boolean {
  return Date.now() < state.nextRetryAt;
}

export class OAuthGuard {
  private state: GuardState;
  private stateFile: string;
  private cfg: GuardConfig;

  constructor(cfg: GuardConfig) {
    this.cfg = cfg;
    this.stateFile = path.join(cfg.stateDir, "oauth-guard-state.json");
    this.state = this.loadState();
  }

  private loadState(): GuardState {
    try {
      const raw = fs.readFileSync(this.stateFile, "utf-8");
      return JSON.parse(raw) as GuardState;
    } catch {
      return { profiles: {}, lastUpdated: Date.now() };
    }
  }

  private saveState(): void {
    this.state.lastUpdated = Date.now();
    try {
      fs.mkdirSync(path.dirname(this.stateFile), { recursive: true });
      fs.writeFileSync(
        this.stateFile,
        JSON.stringify(this.state, null, 2),
        "utf-8",
      );
    } catch {
      // Best-effort persistence
    }
  }

  /**
   * Record an OAuth refresh failure for a profile.
   * Returns the updated failure state.
   */
  recordFailure(profileId: string, provider: string): ProfileFailureState {
    const now = Date.now();
    const existing = this.state.profiles[profileId];

    const updated: ProfileFailureState = {
      profileId,
      provider,
      consecutiveFailures: (existing?.consecutiveFailures ?? 0) + 1,
      firstFailureAt: existing?.firstFailureAt ?? now,
      lastFailureAt: now,
      nextRetryAt: 0,
      disabled: existing?.disabled ?? false,
      disabledAt: existing?.disabledAt,
      recoveryAttempted: existing?.recoveryAttempted ?? false,
    };

    // Compute backoff
    updated.nextRetryAt =
      now +
      computeBackoff(
        updated.consecutiveFailures,
        this.cfg.minBackoffMs,
        this.cfg.maxBackoffMs,
      );

    // Auto-disable after threshold
    if (updated.consecutiveFailures >= this.cfg.maxConsecutiveFailures) {
      updated.disabled = true;
      updated.disabledAt = updated.disabledAt ?? now;
    }

    this.state.profiles[profileId] = updated;
    this.saveState();
    return updated;
  }

  /**
   * Record a successful auth resolution — resets failure tracking.
   */
  recordSuccess(profileId: string): void {
    if (this.state.profiles[profileId]) {
      delete this.state.profiles[profileId];
      this.saveState();
    }
  }

  /**
   * Check if a profile should be blocked from retrying.
   */
  shouldBlock(profileId: string): {
    blocked: boolean;
    reason?: string;
    nextRetryAt?: number;
  } {
    const ps = this.state.profiles[profileId];
    if (!ps) return { blocked: false };

    if (ps.disabled) {
      return {
        blocked: true,
        reason: `OAuth profile '${profileId}' auto-disabled after ${ps.consecutiveFailures} consecutive failures. Re-auth with: openclaw models auth paste-token --provider ${ps.provider}`,
        nextRetryAt: ps.nextRetryAt,
      };
    }

    if (isInBackoff(ps)) {
      const secsLeft = Math.ceil((ps.nextRetryAt - Date.now()) / 1000);
      return {
        blocked: true,
        reason: `OAuth profile '${profileId}' in backoff — next retry in ${secsLeft}s (failure #${ps.consecutiveFailures})`,
        nextRetryAt: ps.nextRetryAt,
      };
    }

    return { blocked: false };
  }

  getProfileState(profileId: string): ProfileFailureState | undefined {
    return this.state.profiles[profileId];
  }

  getAllStates(): Record<string, ProfileFailureState> {
    return { ...this.state.profiles };
  }

  /**
   * Mark a profile's recovery as attempted (keychain import).
   */
  markRecoveryAttempted(profileId: string): void {
    const ps = this.state.profiles[profileId];
    if (ps) {
      ps.recoveryAttempted = true;
      this.saveState();
    }
  }

  /**
   * Reset a specific profile's failure state (e.g. after manual re-auth).
   */
  resetProfile(profileId: string): void {
    delete this.state.profiles[profileId];
    this.saveState();
  }

  /**
   * Reset all failure states.
   */
  resetAll(): void {
    this.state.profiles = {};
    this.saveState();
  }
}
