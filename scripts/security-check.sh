#!/usr/bin/env bash
#
# security-check.sh — scan staged files for secrets before commit
#
# Runs as a pre-commit hook. Also callable standalone:
#   ./scripts/security-check.sh [--all]    (--all scans entire repo)
#
set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
NC='\033[0m'

SCAN_ALL=false
if [[ "${1:-}" == "--all" ]]; then
  SCAN_ALL=true
fi

# Patterns that should never appear in committed code
SECRET_PATTERNS=(
  # API tokens and keys
  'AKIA[0-9A-Z]{16}'                          # AWS access key
  'ghp_[a-zA-Z0-9]{36}'                       # GitHub PAT
  'gho_[a-zA-Z0-9]{36}'                       # GitHub OAuth
  'github_pat_[a-zA-Z0-9_]{82}'               # GitHub fine-grained PAT
  'sk-[a-zA-Z0-9]{20,}'                       # OpenAI / Stripe secret key
  'xoxb-[0-9]+-[0-9]+-[a-zA-Z0-9]+'           # Slack bot token
  'xoxp-[0-9]+-[0-9]+-[a-zA-Z0-9]+'           # Slack user token
  '[0-9]+:AA[A-Za-z0-9_-]{33}'                # Telegram bot token
  'AIza[0-9A-Za-z_-]{35}'                     # Google API key

  # Hardcoded secrets in assignment context
  'PASSWORD\s*=\s*["\x27][^"\x27]{8,}'        # PASSWORD = "..."
  'SECRET\s*=\s*["\x27][^"\x27]{8,}'          # SECRET = "..."
  'TOKEN\s*=\s*["\x27][a-zA-Z0-9_-]{20,}'     # TOKEN = "long-string"
  'GATEWAY_TOKEN\s*=\s*["\x27][a-fA-F0-9]{20,}' # GATEWAY_TOKEN = "hex"
  'api_key\s*=\s*["\x27][^"\x27]{8,}'         # api_key = "..."
  'apikey\s*=\s*["\x27][^"\x27]{8,}'          # apikey = "..."

  # Private keys
  'BEGIN (RSA |EC |DSA |OPENSSH )?PRIVATE KEY'
  'BEGIN PGP PRIVATE KEY'
)

# Files to always skip (binary, docs, this script itself)
SKIP_PATTERNS='\.png$|\.jpg$|\.jpeg$|\.gif$|\.ico$|\.woff|\.ttf$|\.age$|security-check\.sh$'

FOUND=0

check_content() {
  local file="$1"
  local content="$2"

  # Skip binary-looking files and this script
  if echo "$file" | grep -qE "$SKIP_PATTERNS"; then
    return
  fi

  for pattern in "${SECRET_PATTERNS[@]}"; do
    matches=$(echo "$content" | grep -nEi "$pattern" 2>/dev/null || true)
    if [[ -n "$matches" ]]; then
      echo -e "${RED}BLOCKED${NC} — potential secret in ${YELLOW}${file}${NC}"
      echo "$matches" | head -3 | while read -r line; do
        echo -e "  ${RED}→${NC} $line"
      done
      FOUND=$((FOUND + 1))
    fi
  done
}

echo -e "${GREEN}Running security scan...${NC}"

if $SCAN_ALL; then
  # Scan entire repo
  while IFS= read -r file; do
    if [[ -f "$file" ]]; then
      content=$(cat "$file" 2>/dev/null || true)
      check_content "$file" "$content"
    fi
  done < <(git ls-files)
else
  # Scan only staged files (pre-commit mode)
  while IFS= read -r file; do
    if [[ -n "$file" ]]; then
      content=$(git show ":$file" 2>/dev/null || true)
      check_content "$file" "$content"
    fi
  done < <(git diff --cached --name-only --diff-filter=ACM)
fi

# Check for .env files being committed
env_files=$(git diff --cached --name-only --diff-filter=ACM 2>/dev/null | grep -E '\.env($|\.)' || true)
if [[ -n "$env_files" && ! $SCAN_ALL ]]; then
  echo -e "${RED}BLOCKED${NC} — .env file staged for commit:"
  echo "$env_files"
  FOUND=$((FOUND + 1))
fi

# Check for key/pem files
key_files=$(git diff --cached --name-only --diff-filter=ACM 2>/dev/null | grep -E '\.(key|pem|p12|pfx)$' || true)
if [[ -n "$key_files" && ! $SCAN_ALL ]]; then
  echo -e "${RED}BLOCKED${NC} — private key file staged for commit:"
  echo "$key_files"
  FOUND=$((FOUND + 1))
fi

if [[ $FOUND -gt 0 ]]; then
  echo ""
  echo -e "${RED}Commit blocked: $FOUND security issue(s) found.${NC}"
  echo -e "Fix the issues above, or bypass with: ${YELLOW}git commit --no-verify${NC}"
  exit 1
else
  echo -e "${GREEN}No secrets detected.${NC}"
  exit 0
fi
