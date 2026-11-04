#!/usr/bin/env bash
# Build the real React UI in safe public-preview mode and stage it under website/studio/.
# This runs in Cloudflare's Linux build environment before Wrangler deploys static assets.
set -euo pipefail
cd "$(dirname "$0")/.."
npm install --prefix frontend --no-audit --no-fund
VITE_PUBLIC_STUDIO=1 npm run build --prefix frontend -- --base=/studio/
mkdir -p website/studio
cp -R frontend/dist/. website/studio/
test -s website/studio/index.html
test -s website/studio/assets/$(find website/studio/assets -maxdepth 1 -name '*.js' -printf '%f\n' | head -n 1)
echo "Public studio built at website/studio/"
