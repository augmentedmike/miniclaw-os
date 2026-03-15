#!/usr/bin/env bash
# install-checks.test.sh — verify install.sh produces correct config and structure
#
# Tests for fixes #37-#41. Runs without a real install by checking
# the install script's config generation and the resulting file structure.
#
# Usage: bash tests/install-checks.test.sh

set -euo pipefail

PASS=0
FAIL=0

pass() { echo "  ✓ $1"; PASS=$((PASS + 1)); }
fail() { echo "  ✗ $1 — $2"; FAIL=$((FAIL + 1)); }

REPO_DIR="$(cd "$(dirname "$0")/.." && pwd)"

echo ""
echo "── install config checks"

# #41: Model name uses provider prefix in install.sh
if grep -q '"anthropic/claude-sonnet-4-6"' "$REPO_DIR/install.sh"; then
  pass "#41 model uses provider prefix in install.sh"
else
  fail "#41 model missing provider prefix" "should be anthropic/claude-sonnet-4-6"
fi

# #37: install.sh creates USER/voice/ and USER/brain/
if grep -q 'USER/voice' "$REPO_DIR/install.sh"; then
  pass "#37 install.sh creates USER/voice/"
else
  fail "#37 USER/voice/ not created in install.sh" "add mkdir -p to step 10"
fi

if grep -q 'USER/brain' "$REPO_DIR/install.sh"; then
  pass "#37 install.sh creates USER/brain/"
else
  fail "#37 USER/brain/ not created in install.sh" "add mkdir -p to step 10"
fi

# #41: gateway.mode=local in initial config
if grep -q '"gateway".*"mode".*"local"' "$REPO_DIR/install.sh"; then
  pass "#41 gateway.mode=local in initial openclaw.json config"
else
  fail "#41 gateway.mode not set in initial config" "add gateway.mode to openclaw.json creation"
fi

echo ""
echo "── plugin checks"

# #45: mc-booking uses better-sqlite3 (redesigned from hono/turso)
if grep -q 'better-sqlite3' "$REPO_DIR/plugins/mc-booking/package.json"; then
  pass "#45 mc-booking uses better-sqlite3 (local DB)"
else
  fail "#45 mc-booking missing better-sqlite3" "redesign requires local SQLite"
fi

# #40: api.hook guarded in mc-contribute
if grep -q 'typeof api.hook' "$REPO_DIR/plugins/mc-contribute/index.ts"; then
  pass "#40 mc-contribute guards api.hook()"
else
  fail "#40 mc-contribute calls api.hook() without guard" "wrap in typeof check"
fi

# #40: api.hook guarded in mc-github
if grep -q 'typeof api.hook' "$REPO_DIR/plugins/mc-github/index.ts"; then
  pass "#40 mc-github guards api.hook()"
else
  fail "#40 mc-github calls api.hook() without guard" "wrap in typeof check"
fi

echo ""
echo "── no-bun checks"

# Verify no bun references in system scripts
for script in mc-doctor mc-smoke mc; do
  SCRIPT_PATH="$REPO_DIR/SYSTEM/bin/$script"
  [[ -f "$SCRIPT_PATH" ]] || continue
  # Check for bun as a command (not in comments or "bundle" etc)
  BUN_REFS=$(grep -n 'command -v bun\b\|exec bun \|bun install\|bun:sqlite\|"bun"\|bun --version' "$SCRIPT_PATH" 2>/dev/null | grep -v '^#\|BUNDLED\|bundle' || true)
  if [[ -z "$BUN_REFS" ]]; then
    pass "no bun references in $script"
  else
    fail "bun reference in $script" "$BUN_REFS"
  fi
done

echo ""
echo "── mc-smoke install verification section exists"

if grep -q 'install verification' "$REPO_DIR/SYSTEM/bin/mc-smoke"; then
  pass "mc-smoke has install verification section"
else
  fail "mc-smoke missing install verification" "add section from #43"
fi

if grep -q 'AGENT_NAME.*placeholder' "$REPO_DIR/SYSTEM/bin/mc-smoke" || grep -q 'placeholder' "$REPO_DIR/SYSTEM/bin/mc-smoke"; then
  pass "mc-smoke checks for unresolved placeholders"
else
  fail "mc-smoke doesn't check for placeholders" "add workspace template check"
fi

if grep -q 'gateway.mode' "$REPO_DIR/SYSTEM/bin/mc-smoke"; then
  pass "mc-smoke checks gateway.mode"
else
  fail "mc-smoke doesn't check gateway.mode" "add config check"
fi

if grep -q 'duplicate cron' "$REPO_DIR/SYSTEM/bin/mc-smoke"; then
  pass "mc-smoke checks for duplicate crons"
else
  fail "mc-smoke doesn't check for duplicate crons" "add cron dedup check"
fi

# #38: cron dedup handles {jobs:[]} format
if grep -q 'Array.isArray' "$REPO_DIR/plugins/mc-board/web/src/app/api/setup/complete/route.ts"; then
  pass "#38 cron dedup handles both array and {jobs:[]} formats"
else
  fail "#38 cron dedup doesn't handle {jobs:[]} format" "fix JSON parsing in registerCronJobs"
fi

echo ""
echo "── credential injection checks"

# #48: persist route authenticates gh CLI
if grep -q 'gh.*auth.*login.*--with-token' "$REPO_DIR/plugins/mc-board/web/src/app/api/setup/persist/route.ts"; then
  pass "#48 persist route runs gh auth login"
else
  fail "#48 persist route doesn't authenticate gh CLI" "add gh auth login --with-token to persist route"
fi

echo ""
echo "── tool signature checks"

# #46: mc-kb execute() has toolCallId first param
if grep -q 'execute.*_toolCallId.*string\|execute.*_id.*string' "$REPO_DIR/plugins/mc-kb/tools/definitions.ts"; then
  pass "#46 mc-kb execute() has toolCallId first param"
else
  fail "#46 mc-kb execute() missing toolCallId first param" "params received as string instead of object"
fi

echo ""
echo "── agent-runner checks"

# #84: resetStaleRunning has TTL-based cleanup
if grep -q 'STALE_MS' "$REPO_DIR/plugins/mc-board/agent-runner/runner.mjs"; then
  pass "#84 agent-runner has TTL-based stale cleanup"
else
  fail "#84 agent-runner missing stale TTL cleanup" "stale rows consume all concurrent slots"
fi

echo ""
echo "── dependency checks"

# #56: gh CLI installed by install.sh
if grep -q 'brew_install gh' "$REPO_DIR/install.sh"; then
  pass "#56 install.sh installs gh CLI"
else
  fail "#56 install.sh missing gh CLI" "add brew_install gh to step 2"
fi

echo ""
echo "── path consistency checks"

# #52: rolodex web uses USER/rolodex/ not legacy path
if grep -q 'USER.*rolodex.*contacts' "$REPO_DIR/plugins/mc-board/web/src/lib/rolodex.ts" && \
   ! grep -q 'homedir.*"rolodex"' "$REPO_DIR/plugins/mc-board/web/src/lib/rolodex.ts"; then
  pass "#52 rolodex web uses USER/rolodex/ path (no legacy fallback)"
else
  fail "#52 rolodex web still has legacy path fallback" "remove fallback to ~/.openclaw/rolodex/"
fi

echo ""
echo "── rolodex API checks"

# #50: rolodex count API exists
if [[ -f "$REPO_DIR/plugins/mc-board/web/src/app/api/rolodex/count/route.ts" ]]; then
  pass "#50 rolodex count API route exists"
else
  fail "#50 rolodex count API route missing" "add plugins/mc-board/web/src/app/api/rolodex/count/route.ts"
fi

# #50: rolodex data layer exports getContactCount
if grep -q 'getContactCount' "$REPO_DIR/plugins/mc-board/web/src/lib/rolodex.ts"; then
  pass "#50 rolodex.ts exports getContactCount"
else
  fail "#50 rolodex.ts missing getContactCount" "add count query to data layer"
fi

echo ""
echo "── rolodex seed checks"

# #49/#54: complete route seeds rolodex contacts
if grep -q 'seedRolodexContacts' "$REPO_DIR/plugins/mc-board/web/src/app/api/setup/complete/route.ts"; then
  pass "#49/#54 complete route seeds rolodex contacts"
else
  fail "#49/#54 complete route missing rolodex seed" "add seedRolodexContacts to setup complete"
fi

echo ""
echo "── vault env check"

if grep -q 'OPENCLAW_VAULT_ROOT' "$REPO_DIR/plugins/mc-board/web/src/lib/vault.ts"; then
  pass "#32 vault.ts sets OPENCLAW_VAULT_ROOT"
else
  fail "#32 vault.ts missing OPENCLAW_VAULT_ROOT" "vault CLI won't find key"
fi

echo ""
echo "────────────────────────────────────────"
echo "  ${PASS} passed  ${FAIL} failed"
echo "────────────────────────────────────────"

[[ $FAIL -eq 0 ]]
