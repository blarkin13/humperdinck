#!/usr/bin/env bash
set -euo pipefail
if [[ -z "${APPLE_CERTIFICATE:-}" || -z "${APPLE_CERTIFICATE_PASSWORD:-}" || -z "${APPLE_SIGNING_IDENTITY:-}" ]]; then echo 'Apple signing credentials required'; exit 1; fi
KEYCHAIN="$RUNNER_TEMP/humperdinck-signing.keychain-db"
P12="$RUNNER_TEMP/humperdinck-signing.p12"
printf '%s' "$APPLE_CERTIFICATE" | base64 -D > "$P12"
trap 'rm -f "$P12"' EXIT
security create-keychain -p '' "$KEYCHAIN"
security unlock-keychain -p '' "$KEYCHAIN"
security list-keychains -d user -s "$KEYCHAIN"
security default-keychain -s "$KEYCHAIN"
security import "$P12" -k "$KEYCHAIN" -P "$APPLE_CERTIFICATE_PASSWORD" -T /usr/bin/codesign
security set-key-partition-list -S apple-tool:,apple:,codesign: -s -k '' "$KEYCHAIN"
security find-identity -v -p codesigning
security find-identity -v -p codesigning | grep -F "$APPLE_SIGNING_IDENTITY"
echo "APPLE_SIGNING_IDENTITY=$APPLE_SIGNING_IDENTITY" >> "$GITHUB_ENV"
