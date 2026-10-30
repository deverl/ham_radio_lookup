#!/usr/bin/env bash
set -euo pipefail

# Run from the repo root, regardless of where this script was invoked.
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

if [[ ! -f package.json ]] || [[ "$(basename "$ROOT")" != "ham_radio_lookup" ]]; then
  echo "This script must be run from the ham_radio_lookup project." >&2
  exit 1
fi

APP_DIR="${HOME}/.local/share/applications/ham-radio-lookup"
DESKTOP_FILE="${HOME}/.local/share/applications/ham-radio-lookup.desktop"
ICON_DIR="${HOME}/.local/share/ham-radio-lookup/icons"
SHARE_DIR="${HOME}/.local/share/ham-radio-lookup"

removed=0

if [[ -e "$DESKTOP_FILE" ]]; then
  rm -f "$DESKTOP_FILE"
  echo "Removed ${DESKTOP_FILE}"
  removed=$((removed + 1))
fi

if [[ -e "$APP_DIR" ]]; then
  rm -rf "$APP_DIR"
  echo "Removed ${APP_DIR}"
  removed=$((removed + 1))
fi

if [[ -e "$ICON_DIR" ]]; then
  rm -rf "$ICON_DIR"
  echo "Removed ${ICON_DIR}"
  removed=$((removed + 1))
fi

# Remove the share parent if install left nothing else there.
if [[ -d "$SHARE_DIR" ]] && [[ -z "$(ls -A "$SHARE_DIR" 2>/dev/null || true)" ]]; then
  rmdir "$SHARE_DIR"
  echo "Removed ${SHARE_DIR}"
  removed=$((removed + 1))
fi

if [[ "$removed" -eq 0 ]]; then
  echo "Ham Radio Lookup was not installed (nothing to remove)."
else
  echo "Uninstalled Ham Radio Lookup."
fi

echo "Note: app settings, SQLite database, and cached FCC downloads were left in place."
echo "  Settings:  ${HOME}/.config/ham-radio-lookup/"
echo "  Database:  ${HOME}/.config/Ham Radio Query/"
echo "  Downloads: ${HOME}/.cache/ham-radio-lookup/"
