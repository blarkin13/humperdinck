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
import subprocess
import ssl
import tempfile
from urllib.request import Request, urlopen
from zipfile import ZipFile, ZIP_DEFLATED

import certifi

ROOT = Path(__file__).resolve().parents[1]
NAME = "humperdinck-cc0-nature-pack.zip"
URL = "https://github.com/blarkin13/humperdinck/releases/download/nature-sounds-v1/" + NAME
SHA256 = "37c94fa9f2c27df851899d9ac8ed3c8076e0476ea313de838db590a6304c17a7"
EXPECTED_SOUNDS = 9
DESTINATION = ROOT / "assets" / "sound-packs" / NAME
NATIVE_NAME = "humperdinck-native-cc0-sounds-v1.zip"
NATIVE_DESTINATION = DESTINATION.parent / NATIVE_NAME


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
    # Prepare PCM WAVs once on CI. The app does not ship with a licensed
    # FFmpeg binary, so first-launch seed imports must not invoke FFmpeg.
    # imageio-ffmpeg is a BUILD-ONLY conversion tool.
    import imageio_ffmpeg
    decoder = imageio_ffmpeg.get_ffmpeg_exe()
    with ZipFile(BytesIO(raw)) as source:
        manifest = json.loads(source.read("humperdinck-sounds.json"))
        output_manifest = {"version": 1, "sounds": []}
        with tempfile.TemporaryDirectory() as tmp:
            folder = Path(tmp)
            temp_zip = folder / NATIVE_NAME
            with ZipFile(temp_zip, "w", ZIP_DEFLATED, compresslevel=6) as result:
                for entry in manifest["sounds"]:
                    slug = entry["slug"]
                    filename = slug + ".wav"
                    original = folder / ("input-" + slug)
                    target = folder / filename
                    original.write_bytes(source.read(entry["file"]))
                    subprocess.run(
                        [decoder, "-nostdin", "-hide_banner", "-loglevel", "error",
                         "-y", "-i", str(original), "-vn", "-ac", "1", "-ar",
                         "24000", "-c:a", "pcm_s16le", str(target)],
                        check=True, capture_output=True, timeout=150
                    )
                    normalized = target.read_bytes()
                    result.writestr(filename, normalized)
                    output_manifest["sounds"].append({
                        "slug": slug, "file": filename,
                        "sha256": hashlib.sha256(normalized).hexdigest()
                    })
                result.writestr("humperdinck-sounds.json",
                                json.dumps(output_manifest, sort_keys=True))
            prepared = temp_zip.read_bytes()
    NATIVE_DESTINATION.write_bytes(prepared)
    validate_prepared(prepared)
    print(f"Verified {count} curated originals and staged normalized native WAV pack: {NATIVE_DESTINATION}")


def validate_prepared(raw: bytes) -> int:
    with ZipFile(BytesIO(raw)) as archive:
        manifest = json.loads(archive.read("humperdinck-sounds.json"))
        sounds = manifest["sounds"]
        if manifest.get("version") != 1 or len(sounds) != EXPECTED_SOUNDS:
            raise RuntimeError("Native WAV sound pack must contain nine curated items")
        import sys
        if str(ROOT) not in sys.path:
            sys.path.insert(0, str(ROOT))
        from backend.curated_sounds import BY_SLUG
        for item in sounds:
            slug = item["slug"]
            if slug not in BY_SLUG or item["file"] != slug + ".wav":
                raise RuntimeError("Unknown sound or unexpected file name")
            wav = archive.read(item["file"])
            if hashlib.sha256(wav).hexdigest() != item["sha256"]:
                raise RuntimeError("Normalized WAV checksum mismatch")
        return len(sounds)


if __name__ == "__main__":
    main()
