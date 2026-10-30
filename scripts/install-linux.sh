#!/usr/bin/env bash
set -euo pipefail

# Run from the repo root, regardless of where this script was invoked.
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

if [[ ! -f package.json ]] || [[ "$(basename "$ROOT")" != "ham_radio_lookup" ]]; then
  echo "This script must be run from the ham_radio_lookup project." >&2
  exit 1
fi

DIST_DIR="./dist/Ham Radio Lookup-linux-arm64"
APP_DIR="${HOME}/.local/share/applications/ham-radio-lookup"
DESKTOP_FILE="${HOME}/.local/share/applications/ham-radio-lookup.desktop"
ICON_DIR="${HOME}/.local/share/ham-radio-lookup/icons"

if [[ ! -d "$DIST_DIR" ]]; then
  echo "Packaged app not found at ${DIST_DIR}; building..."
  if [[ ! -d node_modules ]]; then
    npm install --include=dev --ignore-scripts
  fi
  npm run install:electron
  npm run pack:linux-arm64
fi

if [[ ! -d "$DIST_DIR" ]]; then
  echo "Build finished but ${DIST_DIR} is still missing." >&2
  exit 1
fi

if [[ ! -d ./build ]] || [[ ! -f ./build/icon.png ]]; then
  echo "Missing ./build/icon.png required for the desktop icon." >&2
  exit 1
fi

mkdir -p "${HOME}/.local/share/applications"
mkdir -p "${HOME}/.local/share/ham-radio-lookup"

cat > "$DESKTOP_FILE" <<EOF
[Desktop Entry]
Type=Application
Name=Ham Radio Lookup
Comment=Electron app to perform license searches
Exec=${HOME}/.local/share/applications/ham-radio-lookup/ham-radio-lookup.sh
Icon=${HOME}/.local/share/ham-radio-lookup/icons/icon.png
Terminal=false
Categories=Utility;Development;
EOF
chmod +x "$DESKTOP_FILE"

rm -rf "$APP_DIR"
cp -a "$DIST_DIR" "$APP_DIR"
mv "${APP_DIR}/Ham Radio Lookup" "${APP_DIR}/ham-radio-lookup.sh"
chmod +x "${APP_DIR}/ham-radio-lookup.sh"

rm -rf "$ICON_DIR"
cp -a ./build "$ICON_DIR"

echo "Installed Ham Radio Lookup."
echo "  Desktop entry: ${DESKTOP_FILE}"
echo "  App directory: ${APP_DIR}"
echo "  Icons:         ${ICON_DIR}"
