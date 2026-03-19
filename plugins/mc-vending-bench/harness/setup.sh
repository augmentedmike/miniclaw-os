#!/usr/bin/env bash
# Setup VendingBench 2 Python environment
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
VENV_DIR="$SCRIPT_DIR/.venv"

echo "Setting up VendingBench 2 harness..."

# Find Python 3.10+ (required by inspect-ai)
PYTHON=""
for p in /opt/homebrew/bin/python3 /usr/local/bin/python3 python3.12 python3.11 python3.10; do
  if command -v "$p" &>/dev/null; then
    ver=$("$p" -c "import sys; print(sys.version_info.minor)")
    if [[ "$ver" -ge 10 ]]; then
      PYTHON="$p"
      break
    fi
  fi
done

if [[ -z "$PYTHON" ]]; then
  echo "  ERROR: Python 3.10+ required. Install via: brew install python@3.12"
  exit 1
fi
echo "  Using: $($PYTHON --version)"

# Create venv if needed
if [[ ! -d "$VENV_DIR" ]]; then
  echo "  Creating Python virtual environment..."
  "$PYTHON" -m venv "$VENV_DIR"
fi

# Activate and install
source "$VENV_DIR/bin/activate"
echo "  Installing dependencies..."
pip install -q -r "$SCRIPT_DIR/requirements.txt"

echo "  Verifying..."
python3 -c "import inspect_ai; print(f'  inspect-ai: OK')"
python3 -c "import multiagent_inspect; print(f'  multiagent-inspect: OK')"

echo ""
echo "Setup complete. Run:"
echo "  openclaw mc-vending-bench run --dry-run"
echo "  openclaw mc-vending-bench run --model anthropic/claude-sonnet-4-6"
