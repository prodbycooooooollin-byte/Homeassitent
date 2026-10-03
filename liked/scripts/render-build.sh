#!/usr/bin/env bash
# Baut den LIKED-Spielserver für Render (oder andere Hoster), egal aus welchem Verzeichnis aufgerufen.
# Installiert nur den Server-Workspace – keine Electron-/Desktop- oder Smart-Home-Pakete.
set -euo pipefail
cd "$(dirname "$0")/.."
npm ci --workspace @liked/server --include-workspace-root=false --ignore-scripts
npm run build -w @liked/server
echo "LIKED-Server gebaut: $(pwd)/apps/server/dist/index.js"
