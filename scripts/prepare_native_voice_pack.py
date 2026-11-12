#!/usr/bin/env python3
"""Download the published, approved Humperdinck voice pack for native builds.

The exact release asset is pinned. Never embed owner's original recordings.
"""
from __future__ import annotations

import hashlib
import json
from pathlib import Path
import ssl
from urllib.request import Request, urlopen
from zipfile import ZipFile
from io import BytesIO

import certifi

import sys
sys.path.insert(0, str(Path(__file__).resolve().parent))
from release_download import fetch  # noqa: E402

ROOT = Path(__file__).resolve().parents[1]
NAME = "humperdinck-builtin-voices-launch-four-v1.zip"
URL = "https://github.com/blarkin13/humperdinck/releases/download/builtin-humperdinck-voices-launch-four-v1/" + NAME
SHA256 = "59086a4e9b53eec23f7d33b3acd6a10d1e5a1328ee80eaf93b59218f29038d38"
EXPECTED_VOICES = 4
EXPECTED_NAMES = {"Sarah", "Jason", "Kenny", "Jerry"}
EXPECTED_SAMPLES = {
    "Sarah": "02739b572307f147d833029e5d2dc2be00e0b8f7d4011ef6727493d2365712ef",
    "Jason": "a2778333d4b14b909c8c03e1170c384ec68aeca33ed12530edfa70767faffd68",
    "Kenny": "b72fde26475138112ebd807cbbe409c968c0292c78d8e46e133c1949c305ade3",
    "Jerry": "f862f358145c9dfd82830fc5ce3393545b68d0ce566f7093b845606890becf72",
}

DESTINATION = ROOT / "assets" / "voice-packs" / NAME


def validate(raw: bytes) -> int:
    digest = hashlib.sha256(raw).hexdigest()
    if digest != SHA256:
        raise RuntimeError(f"Built-In Humperdinck Voices ZIP SHA-256 mismatch: {digest}")
    with ZipFile(BytesIO(raw)) as archive:
        manifest = json.loads(archive.read("manifest.json"))
        if manifest.get("format") != "humperdinck-starter-voices" or manifest.get("version") != 1:
            raise RuntimeError("Unexpected published voice-pack manifest")
        voices = manifest.get("voices", [])
        if len(voices) != EXPECTED_VOICES:
            raise RuntimeError(
                f"Published voice pack has {len(voices)} voices; expected {EXPECTED_VOICES}. "
                "Update the approved release asset before distributing this build."
            )
        if {entry.get("name") for entry in voices} != EXPECTED_NAMES:
            raise RuntimeError("The launch pack must contain Sarah, Jason, Kenny, Jerry only")
        if manifest.get("revision") != 2:
            raise RuntimeError("The four-voice launch pack requires revision 2 for old-voice removal")
        for entry in voices:
            sample = archive.read(entry["sample_file"])
            digest = hashlib.sha256(sample).hexdigest()
            if digest != entry["sha256"] or digest != EXPECTED_SAMPLES[entry["name"]]:
                raise RuntimeError(f"Reference sample checksum mismatch for {entry.get('name')}")
        return len(voices)


def main() -> None:
    if DESTINATION.is_file():
        raw = DESTINATION.read_bytes()
    else:
        raw = fetch(URL, 120 * 1024 * 1024, timeout=120)
    count = validate(raw)
    DESTINATION.parent.mkdir(parents=True, exist_ok=True)
    temp = DESTINATION.with_suffix(".tmp")
    try:
        temp.write_bytes(raw)
        temp.replace(DESTINATION)
    finally:
        temp.unlink(missing_ok=True)
    print(f"Verified and staged {count} Built-In Humperdinck Voices: {DESTINATION}")


if __name__ == "__main__":
    main()
