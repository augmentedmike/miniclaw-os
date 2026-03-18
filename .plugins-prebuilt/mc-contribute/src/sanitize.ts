/**
 * Input sanitization for mc-contribute.
 *
 * All user-provided strings pass through these guards before touching
 * shell commands, file paths, or GitHub API calls. This protects against:
 *   - Shell command injection via backticks, $(), pipes, semicolons
 *   - Path traversal via ../ or absolute paths
 *   - Git ref injection via special characters in branch names
 *   - Oversized payloads that could abuse GitHub API
 */

/** Strict slug: lowercase alphanumeric, hyphens, underscores only. */
const SLUG_RE = /^[a-z0-9][a-z0-9_-]{0,63}$/;

/** GitHub owner/repo format. */
const REPO_RE = /^[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+$/;

/** Git remote name. */
const REMOTE_RE = /^[a-zA-Z0-9_.-]+$/;

/** Characters that are dangerous in shell interpolation. */
const SHELL_DANGEROUS = /[`$\\|;&<>(){}!\n\r]/g;

/** Max length for free-text fields (titles, descriptions). */
const MAX_TITLE = 200;
const MAX_BODY = 10_000;
const MAX_SLUG = 64;

export function sanitizeSlug(input: string, label: string): string {
  const slug = input.trim().toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9_-]/g, "");
  if (!slug || slug.length > MAX_SLUG) {
    throw new Error(`Invalid ${label}: must be 1-${MAX_SLUG} alphanumeric/hyphen/underscore characters, got "${input}"`);
  }
  if (!SLUG_RE.test(slug)) {
    throw new Error(`Invalid ${label}: "${slug}" contains disallowed characters`);
  }
  return slug;
}

export function sanitizePluginName(input: string): string {
  const name = input.replace(/^mc-/, "");
  return sanitizeSlug(name, "plugin name");
}

export function sanitizeBranchTopic(input: string): string {
  return sanitizeSlug(input, "branch topic");
}

export function sanitizeTitle(input: string): string {
  const title = input.trim().replace(SHELL_DANGEROUS, "").slice(0, MAX_TITLE);
  if (!title) throw new Error("Title cannot be empty");
  return title;
}

export function sanitizeBody(input: string): string {
  // Strip shell-dangerous characters but allow markdown formatting
  return input.trim().replace(/[`$\\]/g, "").slice(0, MAX_BODY);
}

export function sanitizeFreeText(input: string, label: string, maxLen = 2000): string {
  const text = input.trim().replace(SHELL_DANGEROUS, "").slice(0, maxLen);
  if (!text) throw new Error(`${label} cannot be empty`);
  return text;
}

export function validateRepo(input: string): string {
  if (!REPO_RE.test(input)) {
    throw new Error(`Invalid repo format: "${input}" — expected owner/name`);
  }
  return input;
}

export function validateRemote(input: string): string {
  if (!REMOTE_RE.test(input)) {
    throw new Error(`Invalid remote name: "${input}"`);
  }
  return input;
}

export function sanitizeFilePath(input: string): string {
  // Block path traversal
  if (input.includes("..") || input.startsWith("/") || input.includes("~")) {
    throw new Error(`Path traversal detected in: "${input}"`);
  }
  return input.replace(/[^a-zA-Z0-9_\-./]/g, "");
}
