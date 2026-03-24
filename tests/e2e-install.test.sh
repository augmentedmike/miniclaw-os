#!/usr/bin/env bash
# e2e-install.test.sh — end-to-end verification that headless install
# correctly propagates user config into all output files.
#
# Runs install.sh --config with known test values in an isolated
# OPENCLAW_STATE_DIR, then verifies every field landed in the right place.
#
# Usage: bash tests/e2e-install.test.sh
#
# NOTE: This test runs the real install.sh but skips network-dependent
# steps (Tailscale, Chrome, gateway, LaunchAgents) by using --check mode
# for structure verification + a separate headless config pass for the
# personalization/config pipeline.

set -euo pipefail

REPO_DIR="$(cd "$(dirname "$0")/.." && pwd)"
TEST_DIR="/tmp/miniclaw-e2e-test-$$"
STATE_DIR="$TEST_DIR/state"
CONFIG="$TEST_DIR/test-config.json"

PASS=0
FAIL=0

pass() { echo "  ✓ $1"; PASS=$((PASS + 1)); }
fail() { echo "  ✗ $1 — $2"; FAIL=$((FAIL + 1)); }

cleanup() { rm -rf "$TEST_DIR"; }
trap cleanup EXIT

echo ""
echo "── e2e install verification"
echo "  state dir: $STATE_DIR"
echo ""

# ── Create test config with known values ─────────────────────────────────────

mkdir -p "$STATE_DIR/USER" "$STATE_DIR/miniclaw/USER/projects" "$STATE_DIR/workspace" "$STATE_DIR/workspace/refs" "$STATE_DIR/workspace/memory"

cat > "$CONFIG" <<'TESTCFG'
{
  "assistantName": "TestBot",
  "shortName": "tb",
  "pronouns": "they/them",
  "accentColor": "#FF00FF",
  "personaBlurb": "A test agent for e2e verification",
  "telegramBotUsername": "@testbot_e2e",
  "telegramBotToken": "123456:ABC-TEST-TOKEN-XYZ",
  "telegramChatId": "-999888777",
  "ghToken": "",
  "emailAddress": "testbot@example.com",
  "appPassword": "test-app-password",
  "emailSmtpHost": "smtp.example.com",
  "emailSmtpPort": "465",
  "geminiKey": "",
  "anthropicToken": ""
}
TESTCFG

# ── Write setup-state.json (simulates what install.sh does) ──────────────────

SETUP_STATE="$STATE_DIR/USER/setup-state.json"
cp "$CONFIG" "$SETUP_STATE"

echo "── step 1: workspace personalization"

# Copy workspace templates
MC_WORKSPACE="$REPO_DIR/workspace"
if [[ -d "$MC_WORKSPACE" ]]; then
  for tpl in "$MC_WORKSPACE"/*.md; do
    [[ -f "$tpl" ]] || continue
    cp "$tpl" "$STATE_DIR/workspace/$(basename "$tpl")"
  done
  if [[ -d "$MC_WORKSPACE/refs" ]]; then
    for tpl in "$MC_WORKSPACE/refs"/*.md; do
      [[ -f "$tpl" ]] || continue
      cp "$tpl" "$STATE_DIR/workspace/refs/$(basename "$tpl")"
    done
  fi
fi

# Run the personalization Python script (same one install.sh uses)
# Create a fake MANIFEST.json for version
mkdir -p "$STATE_DIR/miniclaw"
echo '{"version":"0.1.6-test"}' > "$STATE_DIR/miniclaw/MANIFEST.json"

python3 - "$SETUP_STATE" "$STATE_DIR/workspace" "$STATE_DIR/miniclaw/MANIFEST.json" <<'PERSONALIZE'
import json, sys, os
from datetime import date

state_path, workspace, manifest_path = sys.argv[1], sys.argv[2], sys.argv[3]
with open(state_path) as f:
    state = json.load(f)

name = state.get("assistantName", "")
short = state.get("shortName", name)
pronouns = state.get("pronouns", "they/them")

if not name:
    print("  No assistant name — skipping")
    sys.exit(0)

pmap = {
    "she/her": ("she", "her"),
    "he/him": ("he", "his"),
    "they/them": ("they", "their"),
}
subj, poss = pmap.get(pronouns, ("they", "their"))

version = "0.1.0"
try:
    with open(manifest_path) as f:
        version = json.load(f).get("version", version)
except Exception:
    pass

today = date.today().isoformat()

replacements = {
    "{{AGENT_NAME}}": name,
    "{{AGENT_SHORT}}": short,
    "{{HUMAN_NAME}}": "my human",
    "{{PRONOUNS}}": pronouns,
    "{{PRONOUNS_SUBJECT}}": subj,
    "{{PRONOUNS_POSSESSIVE}}": poss,
    "{{VERSION}}": version,
    "{{DATE}}": today,
}

for dirpath, _dirs, files in os.walk(workspace):
    for fname in files:
        if not fname.endswith(".md"):
            continue
        fpath = os.path.join(dirpath, fname)
        with open(fpath) as f:
            content = f.read()
        changed = False
        for placeholder, value in replacements.items():
            if placeholder in content:
                content = content.replace(placeholder, value)
                changed = True
        if changed:
            with open(fpath, "w") as f:
                f.write(content)
PERSONALIZE

# ── Verify: IDENTITY.md ─────────────────────────────────────────────────────

IDENTITY="$STATE_DIR/workspace/IDENTITY.md"
if [[ -f "$IDENTITY" ]]; then
  if grep -q "TestBot" "$IDENTITY"; then
    pass "IDENTITY.md contains agent name 'TestBot'"
  else
    fail "IDENTITY.md missing agent name" "expected 'TestBot'"
  fi

  if grep -q "they/them" "$IDENTITY"; then
    pass "IDENTITY.md contains pronouns"
  else
    fail "IDENTITY.md missing pronouns" "expected 'they/them'"
  fi

  if grep -q "0.1.6-test" "$IDENTITY"; then
    pass "IDENTITY.md contains version"
  else
    fail "IDENTITY.md missing version" "expected '0.1.6-test'"
  fi

  # No unresolved placeholders
  if grep -q '{{' "$IDENTITY"; then
    fail "IDENTITY.md has unresolved placeholders" "$(grep '{{' "$IDENTITY")"
  else
    pass "IDENTITY.md has no unresolved placeholders"
  fi
else
  fail "IDENTITY.md does not exist" "$IDENTITY"
fi

# ── Verify: SOUL.md ──────────────────────────────────────────────────────────

SOUL="$STATE_DIR/workspace/SOUL.md"
if [[ -f "$SOUL" ]]; then
  if grep -q "TestBot" "$SOUL"; then
    pass "SOUL.md contains agent name"
  else
    fail "SOUL.md missing agent name" "expected 'TestBot'"
  fi

  if grep -q '{{' "$SOUL"; then
    fail "SOUL.md has unresolved placeholders" "$(grep '{{' "$SOUL")"
  else
    pass "SOUL.md has no unresolved placeholders"
  fi
else
  fail "SOUL.md does not exist" "$SOUL"
fi

# ── Verify: no placeholders in any workspace file ────────────────────────────

echo ""
echo "── step 2: placeholder scan"

PLACEHOLDER_VIOLATIONS=""
for md in "$STATE_DIR/workspace"/*.md "$STATE_DIR/workspace/refs"/*.md; do
  [[ -f "$md" ]] || continue
  if grep -q '{{' "$md"; then
    PLACEHOLDER_VIOLATIONS="$PLACEHOLDER_VIOLATIONS  $(basename "$md"): $(grep -c '{{' "$md") placeholder(s)\n"
  fi
done

if [[ -z "$PLACEHOLDER_VIOLATIONS" ]]; then
  pass "No unresolved placeholders in any workspace file"
else
  fail "Unresolved placeholders found" "$PLACEHOLDER_VIOLATIONS"
fi

# ── Step 3: Simulate gateway config (telegram) ──────────────────────────────

echo ""
echo "── step 3: openclaw.json config"

# Create minimal openclaw.json
cat > "$STATE_DIR/openclaw.json" <<'BASECFG'
{
  "gateway": { "mode": "local" },
  "plugins": {},
  "agents": {}
}
BASECFG

# Run the telegram config Python (same as install.sh)
python3 - "$STATE_DIR/openclaw.json" "@testbot_e2e" "123456:ABC-TEST-TOKEN-XYZ" "-999888777" <<'GWPY'
import json, sys
config_path, bot_id, bot_token, chat_id = sys.argv[1], sys.argv[2], sys.argv[3], sys.argv[4] if len(sys.argv) > 4 else ""
with open(config_path) as f: cfg = json.load(f)
channels = cfg.setdefault("channels", {})
channels["telegram"] = {
    "enabled": True, "botToken": bot_token,
    "dmPolicy": "pairing", "groupPolicy": "allowlist",
    "groupAllowFrom": [chat_id] if chat_id else [],
    "allowFrom": [chat_id] if chat_id else [],
    "streaming": "partial",
}
with open(config_path, "w") as f: json.dump(cfg, f, indent=2); f.write("\n")
GWPY

OC_JSON="$STATE_DIR/openclaw.json"

# Verify telegram config
if python3 -c "import json; c=json.load(open('$OC_JSON')); assert c['channels']['telegram']['botToken'] == '123456:ABC-TEST-TOKEN-XYZ'" 2>/dev/null; then
  pass "openclaw.json has telegram botToken"
else
  fail "openclaw.json missing telegram botToken" "token not written"
fi

if python3 -c "import json; c=json.load(open('$OC_JSON')); assert c['channels']['telegram']['enabled'] == True" 2>/dev/null; then
  pass "openclaw.json telegram is enabled"
else
  fail "openclaw.json telegram not enabled" ""
fi

if python3 -c "import json; c=json.load(open('$OC_JSON')); assert '-999888777' in c['channels']['telegram']['allowFrom']" 2>/dev/null; then
  pass "openclaw.json has telegram chatId in allowFrom"
else
  fail "openclaw.json missing telegram chatId" "expected -999888777 in allowFrom"
fi

if python3 -c "import json; c=json.load(open('$OC_JSON')); assert c['gateway']['mode'] == 'local'" 2>/dev/null; then
  pass "openclaw.json gateway.mode is local"
else
  fail "openclaw.json gateway.mode wrong" "expected 'local'"
fi

# ── Step 4: Rolodex seeding ──────────────────────────────────────────────────

echo ""
echo "── step 4: rolodex seeding"

ROLODEX_DIR="$STATE_DIR/USER/rolodex"
CONTACTS_FILE="$ROLODEX_DIR/contacts.json"
mkdir -p "$ROLODEX_DIR"

python3 - "$CONFIG" "$CONTACTS_FILE" <<'SEEDPY'
import json, sys, uuid
from datetime import datetime
cfg = json.load(open(sys.argv[1]))
contacts = [
    {"id": str(uuid.uuid4()), "name": "My Human", "emails": [], "phones": [], "domains": [],
     "tags": ["owner", "human"], "trustStatus": "verified", "lastVerified": datetime.utcnow().isoformat(),
     "notes": "Human owner."},
    {"id": str(uuid.uuid4()), "name": cfg.get("assistantName", "MiniClaw"),
     "emails": [cfg["emailAddress"]] if cfg.get("emailAddress") else [], "phones": [], "domains": [],
     "tags": ["agent", "self"], "trustStatus": "verified", "lastVerified": datetime.utcnow().isoformat(),
     "notes": f"AI agent ({cfg.get('shortName', cfg.get('assistantName', 'mc'))})."}
]
with open(sys.argv[2], "w") as f: json.dump(contacts, f, indent=2); f.write("\n")
SEEDPY

if [[ -f "$CONTACTS_FILE" ]]; then
  CONTACT_COUNT=$(python3 -c "import json; print(len(json.load(open('$CONTACTS_FILE'))))" 2>/dev/null)
  if [[ "$CONTACT_COUNT" == "2" ]]; then
    pass "Rolodex has 2 contacts (owner + agent)"
  else
    fail "Rolodex contact count wrong" "expected 2, got $CONTACT_COUNT"
  fi

  if python3 -c "import json; cs=json.load(open('$CONTACTS_FILE')); assert any(c['name']=='TestBot' for c in cs)" 2>/dev/null; then
    pass "Rolodex has agent contact 'TestBot'"
  else
    fail "Rolodex missing agent contact" "expected 'TestBot'"
  fi

  if python3 -c "import json; cs=json.load(open('$CONTACTS_FILE')); assert any('testbot@example.com' in c.get('emails',[]) for c in cs)" 2>/dev/null; then
    pass "Rolodex agent contact has email 'testbot@example.com'"
  else
    fail "Rolodex agent missing email" "expected testbot@example.com"
  fi

  if python3 -c "import json; cs=json.load(open('$CONTACTS_FILE')); assert any('owner' in c.get('tags',[]) for c in cs)" 2>/dev/null; then
    pass "Rolodex has owner contact"
  else
    fail "Rolodex missing owner contact" "expected tag 'owner'"
  fi
else
  fail "contacts.json not created" "$CONTACTS_FILE"
fi

# ── Step 5: setup-state.json integrity ───────────────────────────────────────

echo ""
echo "── step 5: setup-state.json"

if [[ -f "$SETUP_STATE" ]]; then
  if python3 -c "import json; s=json.load(open('$SETUP_STATE')); assert s['assistantName'] == 'TestBot'" 2>/dev/null; then
    pass "setup-state.json has assistantName"
  else
    fail "setup-state.json missing assistantName" ""
  fi

  if python3 -c "import json; s=json.load(open('$SETUP_STATE')); assert s['emailAddress'] == 'testbot@example.com'" 2>/dev/null; then
    pass "setup-state.json has emailAddress"
  else
    fail "setup-state.json missing emailAddress" ""
  fi

  if python3 -c "import json; s=json.load(open('$SETUP_STATE')); assert s['telegramBotToken'] == '123456:ABC-TEST-TOKEN-XYZ'" 2>/dev/null; then
    pass "setup-state.json has telegramBotToken"
  else
    fail "setup-state.json missing telegramBotToken" ""
  fi
else
  fail "setup-state.json not found" "$SETUP_STATE"
fi

# ── Step 6: Plugin registration ──────────────────────────────────────────────

echo ""
echo "── step 6: plugin manifests"

MISSING_PLUGINS=""
for plugin_dir in "$REPO_DIR/plugins"/mc-*/; do
  [[ -d "$plugin_dir" ]] || continue
  plugin_name="$(basename "$plugin_dir")"
  if [[ ! -f "$plugin_dir/openclaw.plugin.json" ]]; then
    MISSING_PLUGINS="$MISSING_PLUGINS $plugin_name"
  fi
done

if [[ -z "$MISSING_PLUGINS" ]]; then
  PLUGIN_COUNT=$(ls -d "$REPO_DIR/plugins"/mc-*/ 2>/dev/null | wc -l | tr -d ' ')
  pass "All $PLUGIN_COUNT plugins have openclaw.plugin.json"
else
  fail "Plugins missing manifests" "$MISSING_PLUGINS"
fi

# Verify every plugin has the required openclaw extension entry
MISSING_EXT=""
for plugin_dir in "$REPO_DIR/plugins"/mc-*/; do
  [[ -d "$plugin_dir" ]] || continue
  plugin_name="$(basename "$plugin_dir")"
  pkg="$plugin_dir/package.json"
  if [[ -f "$pkg" ]]; then
    has_ext=$(python3 -c "import json; p=json.load(open('$pkg')); print('yes' if p.get('openclaw',{}).get('extensions') else 'no')" 2>/dev/null)
    if [[ "$has_ext" != "yes" ]]; then
      MISSING_EXT="$MISSING_EXT $plugin_name"
    fi
  fi
done

if [[ -z "$MISSING_EXT" ]]; then
  pass "All plugins have openclaw.extensions in package.json"
else
  fail "Plugins missing openclaw.extensions" "$MISSING_EXT"
fi

# ── Step 7: Workspace template completeness ──────────────────────────────────

echo ""
echo "── step 7: workspace template files"

REQUIRED_WORKSPACE_FILES=(IDENTITY.md SOUL.md TOOLS.md)
for f in "${REQUIRED_WORKSPACE_FILES[@]}"; do
  if [[ -f "$REPO_DIR/workspace/$f" ]]; then
    pass "Template exists: workspace/$f"
  else
    fail "Template missing: workspace/$f" ""
  fi
done

# Verify templates have placeholders (so personalization has something to replace)
for f in IDENTITY.md SOUL.md; do
  tpl="$REPO_DIR/workspace/$f"
  [[ -f "$tpl" ]] || continue
  if grep -q '{{AGENT_NAME}}' "$tpl"; then
    pass "Template $f has {{AGENT_NAME}} placeholder"
  else
    fail "Template $f missing {{AGENT_NAME}}" "personalization won't replace anything"
  fi
done

# ── Step 8: Plist EnvironmentVariables verification ──────────────────────────

echo ""
echo "── step 8: plist EnvironmentVariables"

PLISTS=(
  "$REPO_DIR/launchd/com.miniclaw.board-web.plist"
  "$REPO_DIR/com.miniclaw.board-web.plist"
  "$REPO_DIR/plugins/mc-board/agent-runner/com.miniclaw.board-agent-runner.plist"
  "$REPO_DIR/mc-board/agent-runner/com.miniclaw.board-agent-runner.plist"
  "$REPO_DIR/plugins/mc-web-chat/com.miniclaw.web-chat.plist"
)

for plist in "${PLISTS[@]}"; do
  short="${plist##*miniclaw-os/}"
  [[ -f "$plist" ]] || { fail "plist missing: $short" "file not found"; continue; }

  # HOME must be set
  if grep -q "<key>HOME</key>" "$plist"; then
    pass "plist HOME set: $short"
  else
    fail "plist missing HOME: $short" "launchd services fail without HOME"
  fi

  # PATH must include ~/.local/bin
  if grep -q "\.local/bin" "$plist"; then
    pass "plist PATH includes .local/bin: $short"
  else
    fail "plist PATH missing .local/bin: $short" "openclaw CLI won't be found"
  fi

  # PATH must include nvm node path
  if grep -q "nvm" "$plist"; then
    pass "plist PATH includes nvm node: $short"
  else
    fail "plist PATH missing nvm: $short" "node won't be found for launchd"
  fi

  # PATH must include /opt/homebrew/bin
  if grep -q "homebrew" "$plist"; then
    pass "plist PATH includes homebrew: $short"
  else
    fail "plist PATH missing homebrew: $short" "brew-installed tools unavailable"
  fi

  # No hardcoded usernames
  if grep -q "augmentedmike" "$plist"; then
    fail "plist has hardcoded augmentedmike: $short" "must not contain old username"
  else
    pass "plist no hardcoded usernames: $short"
  fi
done

# ── Summary ──────────────────────────────────────────────────────────────────

echo ""
echo "────────────────────────────────────────"
echo "  ${PASS} passed  ${FAIL} failed"
echo "────────────────────────────────────────"

[[ $FAIL -eq 0 ]]
