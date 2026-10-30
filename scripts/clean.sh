#!/usr/bin/env bash
set -euo pipefail

# Run from the repo root, regardless of where this script was invoked.
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

if [[ ! -f package.json ]] || [[ "$(basename "$ROOT")" != "ham_radio_lookup" ]]; then
  echo "This script must be run from the ham_radio_lookup project." >&2
  exit 1
fi

# Derived / downloadable artifacts only. Do not remove ./build (app icons).
targets=(
  dist
  node_modules
  .electron-download
  .electron-cache
  .DS_Store
)

removed=0
for path in "${targets[@]}"; do
  if [[ -e "$path" ]]; then
    rm -rf "$path"
    echo "Removed ${path}"
    removed=$((removed + 1))
  fi
done

if [[ "$removed" -eq 0 ]]; then
  echo "Nothing to clean."
else
  echo "Clean finished (${removed} item(s) removed)."
fi
