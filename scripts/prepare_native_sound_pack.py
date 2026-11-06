#!/usr/bin/env python3
"""Pin and verify the published curated nature sounds used by native installers.

Assets are CC0 recordings from the project's reviewed nature sound release,
not generated audio. Do not invent missing audio and do not skip checksum checks.
"""
from __future__ import annotations

import hashlib
from io import BytesIO
import json
from pathlib import Path
import ssl
from urllib.request import Request, urlopen
from zipfile import ZipFile

import certifi

ROOT = Path(__file__).resolve().parents[1]
NAME = "humperdinck-cc0-nature-pack.zip"
URL = "https://github.com/blarkin13/humperdinck/releases/download/nature-sounds-v1/" + NAME
SHA256 = "37c94fa9f2c27df851899d9ac8ed3c8076e0476ea313de838db590a6304c17a7"
EXPECTED_SOUNDS = 9
DESTINATION = ROOT / "assets" / "sound-packs" / NAME


def validate(raw: bytes) -> int:
    if hashlib.sha256(raw).hexdigest() != SHA256:
        raise RuntimeError("Published sound-pack SHA256 does not match the pinned release asset")
    with ZipFile(BytesIO(raw)) as archive:
        if len(archive.infolist()) > 25:
            raise RuntimeError("Too many files in the curated sound pack")
        manifest = json.loads(archive.read("humperdinck-sounds.json"))
        sounds = manifest.get("sounds", [])
        if manifest.get("version") != 1 or len(sounds) != EXPECTED_SOUNDS:
            raise RuntimeError(f"Published pack has {len(sounds)} sounds; expected {EXPECTED_SOUNDS}")
        seen = set()
        for item in sounds:
            slug, filename = item["slug"], item["file"]
            if slug in seen or filename.startswith(("/", ".")) or "/" in filename or "\\" in filename:
                raise RuntimeError("Duplicate slug or unsafe sound-pack file path")
            seen.add(slug)
            audio = archive.read(filename)
            if hashlib.sha256(audio).hexdigest() != item["sha256"]:
                raise RuntimeError(f"Sound file checksum mismatch: {slug}")
        return len(sounds)


def main() -> None:
    if DESTINATION.is_file():
        raw = DESTINATION.read_bytes()
    else:
        req = Request(URL, headers={"User-Agent": "Humperdinck-NativeBuilder/1.0"})
        context = ssl.create_default_context(cafile=certifi.where())
        with urlopen(req, timeout=180, context=context) as response:
            raw = response.read(150 * 1024 * 1024 + 1)
    count = validate(raw)
    DESTINATION.parent.mkdir(parents=True, exist_ok=True)
    temp = DESTINATION.with_suffix(".tmp")
    try:
        temp.write_bytes(raw)
        temp.replace(DESTINATION)
    finally:
        temp.unlink(missing_ok=True)
    print(f"Verified and staged {count} curated Humperdinck sound effects: {DESTINATION}")


if __name__ == "__main__":
    main()
