#!/usr/bin/env python3
"""Generate Tauri's release-only updater configuration.

The public verification key belongs in the built binary; the PRIVATE signing
key is supplied separately to Tauri via GitHub Actions secrets.
"""
import json
import os
from pathlib import Path

ENDPOINT = "https://humperdinck.larki-brian.workers.dev/updates/latest.json"

def main():
    pubkey = os.environ.get("HUMPERDINCK_UPDATER_PUBKEY", "").strip()
    if not pubkey or len(pubkey) < 40 or len(pubkey) > 8192:
        raise SystemExit("HUMPERDINCK_UPDATER_PUBKEY must contain the full Tauri .key.pub contents")
    if any(ch.isspace() for ch in pubkey):
        raise SystemExit("Unexpected whitespace in the updater verification key")
    config = {
        "bundle": {"createUpdaterArtifacts": True},
        "plugins": {"updater": {"pubkey": pubkey, "endpoints": [ENDPOINT]}},
    }
    target = Path("desktop/src-tauri/signing.updater.json")
    target.write_text(json.dumps(config, indent=2) + "\n", encoding="utf-8")
    print("Configured Tauri signed updater artifacts and HTTPS endpoint (public key omitted from logs)")

if __name__ == "__main__":
    main()
