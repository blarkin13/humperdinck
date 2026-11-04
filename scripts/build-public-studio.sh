#!/usr/bin/env bash
# Build the real React UI in safe public-preview mode and stage it under website/studio/.
# This runs in Cloudflare's Linux build environment before Wrangler deploys static assets.
set -euo pipefail
cd "$(dirname "$0")/.."
npm install --prefix frontend --no-audit --no-fund
BUILD_ID="$(git rev-parse --short=12 HEAD 2>/dev/null || date -u +%Y%m%d%H%M%S)"
VITE_PUBLIC_STUDIO=1 VITE_BUILD_ID="$BUILD_ID" npm run build --prefix frontend -- --base=/studio/
mkdir -p website/studio
# The static homepage links to a version-specific Studio URL for immediate refresh.
# Fingerprinted Vite JS/CSS are already automatically cache-busted.
sed -i "s|href=\"/studio/\"|href=\"/studio/?v=$BUILD_ID\"|g" website/index.html
printf '{\"revision\":\"%s\",\"studio\":\"/studio/?v=%s\"}\\n' "$BUILD_ID" "$BUILD_ID" > website/build.json
cp -R frontend/dist/. website/studio/
# Copy the runtime-matched ONNX WASM binary to our own static origin. The
# browser worker sets env.wasmPaths to this file instead of relying on a CDN.
WASM_DIR="$(find frontend/node_modules/@huggingface/transformers frontend/node_modules/onnxruntime-web -type f -name 'ort-wasm-simd-threaded.jsep.wasm' -print -quit 2>/dev/null | xargs -r dirname)"
if [[ -z "$WASM_DIR" || ! -s "$WASM_DIR/ort-wasm-simd-threaded.jsep.wasm" ]]; then
  echo 'ONNX WebAssembly binaries not found in installed npm dependencies' >&2
  exit 1
fi
mkdir -p website/studio/wasm
find "$WASM_DIR" -maxdepth 1 -type f -name 'ort-wasm*.wasm' -exec cp {} website/studio/wasm/ \;
test -s website/studio/index.html
test -s website/studio/assets/$(find website/studio/assets -maxdepth 1 -name '*.js' -printf '%f\n' | head -n 1)
echo "Public studio built at website/studio/"

test -s website/build.json
grep -q "$BUILD_ID" website/studio/assets/*.js

test -s website/studio/wasm/ort-wasm-simd-threaded.jsep.wasm
