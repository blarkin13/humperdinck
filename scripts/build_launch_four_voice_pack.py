#!/usr/bin/env python3
"""Build the four-voice launch pack (Sarah, Jason, Kenny, Jerry) reproducibly.

Usage: build_launch_four_voice_pack.py SOURCE_DIR OUTPUT_ZIP

SOURCE_DIR holds the owner-supplied Sarah.wav, Jason.wav, Jerry.wav and
Kenny.mp3. Kenny is decoded with FFmpeg to 24 kHz mono 16-bit PCM using
bit-exact flags. ZIP entries use a fixed timestamp and order, so the same
inputs and FFmpeg build give the same bytes and SHA-256.
"""
from __future__ import annotations

from hashlib import sha256
import json
from pathlib import Path
import subprocess
import sys
import tempfile
from uuid import NAMESPACE_URL, uuid5
from zipfile import ZIP_DEFLATED, ZipFile, ZipInfo

SENTENCE = "The old lighthouse stood quietly above the waves, waiting for the next storm."
NAMES = ("Sarah", "Jason", "Kenny", "Jerry")
STAMP = (2026, 11, 12, 0, 0, 0)


def voice_id(name: str) -> str:
    return uuid5(NAMESPACE_URL, "humperdinck:starter-voice:launch-four:" + name).hex


def sample(source: Path, name: str, work: Path) -> bytes:
    wav = source / (name + ".wav")
    if wav.is_file():
        return wav.read_bytes()
    out = work / (name + ".wav")
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", str(source / (name + ".mp3")),
                    "-ar", "24000", "-ac", "1", "-c:a", "pcm_s16le", "-map_metadata", "-1",
                    "-fflags", "+bitexact", "-flags:a", "+bitexact", str(out)], check=True)
    return out.read_bytes()


def entry(pack: ZipFile, path: str, data: bytes) -> None:
    info = ZipInfo(path, STAMP)
    info.compress_type = ZIP_DEFLATED
    info.external_attr = 0o644 << 16
    pack.writestr(info, data)


def build(source: Path, output: Path) -> str:
    manifest = {"format": "humperdinck-starter-voices", "version": 1, "revision": 2,
                "reference_text": SENTENCE, "voices": []}
    with tempfile.TemporaryDirectory() as tmp, ZipFile(output, "w") as pack:
        for name in NAMES:
            raw = sample(source, name, Path(tmp))
            uid = voice_id(name)
            entry(pack, f"samples/{uid}.wav", raw)
            manifest["voices"].append({"voice_id": uid, "name": name, "category": "Narrators",
                                       "reference_text": SENTENCE, "refinement_description": {},
                                       "sample_file": f"samples/{uid}.wav",
                                       "sha256": sha256(raw).hexdigest()})
        entry(pack, "manifest.json", json.dumps(manifest, indent=2).encode())
    return sha256(output.read_bytes()).hexdigest()


if __name__ == "__main__":
    if len(sys.argv) != 3:
        sys.exit(__doc__)
    print(build(Path(sys.argv[1]), Path(sys.argv[2])))
