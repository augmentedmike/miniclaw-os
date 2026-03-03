#!/usr/bin/env bash
# miniclaw-os install script
# Installs miniclaw into ~/.openclaw/miniclaw/ by symlinking
# plugins/ and system/ from this source repo.
# Safe to re-run — idempotent.

set -euo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
INSTALL_DIR="${HOME}/.openclaw/miniclaw"

echo "miniclaw-os installer"
echo "  source : ${REPO_DIR}"
echo "  install: ${INSTALL_DIR}"
echo ""

mkdir -p "${INSTALL_DIR}"

for dir in plugins system; do
  src="${REPO_DIR}/${dir}"
  dst="${INSTALL_DIR}/${dir}"

  if [ ! -d "${src}" ]; then
    echo "  skip   ${dir}/ (not in source)"
    continue
  fi

  if [ -L "${dst}" ]; then
    echo "  exists ${dir}/ -> $(readlink "${dst}")"
  elif [ -d "${dst}" ]; then
    echo "  WARNING: ${dst} is a real directory, not a symlink — skipping"
    echo "           Remove it manually if you want to replace it: rm -rf ${dst}"
  else
    ln -s "${src}" "${dst}"
    echo "  linked ${dir}/ -> ${src}"
  fi
done

echo ""
echo "Done. miniclaw is installed at ${INSTALL_DIR}"
