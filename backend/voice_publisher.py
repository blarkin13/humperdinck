"""Publish Built-In Humperdinck Voices from the developer copy of the app.

Runs only on the publisher's own computer, using their signed-in GitHub CLI,
so no upload credentials ever ship inside Humperdinck.
"""
from __future__ import annotations

import json
from pathlib import Path
import shutil
import subprocess
import tempfile
import time

from backend.starter_voice_packs import StarterVoices

REPOSITORY = "blarkin13/humperdinck-downloads"
TAG = "voices"


def _gh(*args: str) -> subprocess.CompletedProcess:
    return subprocess.run(["gh", *args, "-R", REPOSITORY], capture_output=True, text=True, timeout=300)


def publish(bank: StarterVoices) -> dict:
    gh = shutil.which("gh")
    if not gh:
        raise RuntimeError("Install the GitHub CLI (brew install gh) and run `gh auth login` first.")
    voices = bank.list()
    approved = [v["source_voice_id"] for v in voices if v["channel"] == "builtin"]
    gallery = [v["source_voice_id"] for v in voices if v["channel"] == "catalog"]
    if not approved:
        raise ValueError("Keep at least one voice as Built-in before publishing.")
    revision = int(time.time())
    raw = bank.export(approved, revision)
    entries = list(bank.catalog_files(gallery))
    if _gh("release", "view", TAG).returncode != 0:
        # A prerelease never becomes the "latest" app release the website offers.
        made = _gh("release", "create", TAG, "--prerelease", "--title", "Built-In Humperdinck Voices",
                   "--notes", "Voice pack the app downloads automatically. Managed by the Humperdinck publisher.")
        if made.returncode != 0:
            raise RuntimeError("Could not create the voices release: " + made.stderr.strip())
    with tempfile.TemporaryDirectory() as folder:
        pack = Path(folder) / "pack.zip"
        latest = Path(folder) / "latest.json"
        catalog = Path(folder) / "catalog.json"
        samples = []
        for entry, audio in entries:
            sample = Path(folder) / entry["file"]
            sample.write_bytes(audio)
            samples.append(sample)
        pack.write_bytes(raw)
        catalog.write_text(json.dumps({"revision": revision, "voices": [e for e, _ in entries]}))
        latest.write_text(json.dumps({"revision": revision, "voices": len(approved)}))
        # Upload files before the lists that point at them, so nobody sees a voice whose file is missing.
        for file in (*samples, pack, catalog, latest):
            sent = _gh("release", "upload", TAG, str(file), "--clobber")
            if sent.returncode != 0:
                raise RuntimeError("Upload failed: " + sent.stderr.strip())
    _remove_old_gallery_files({e["file"] for e, _ in entries})
    record = {"revision": revision, "voices": len(approved), "gallery": len(entries),
              "published_at": time.strftime("%Y-%m-%d %H:%M", time.localtime(revision))}
    (bank.folder / "published.json").write_text(json.dumps(record))
    return record


def _remove_old_gallery_files(keep: set[str]) -> None:
    listed = _gh("release", "view", TAG, "--json", "assets", "-q", ".assets[].name")
    for name in listed.stdout.split():
        if name.startswith("catalog-") and name.endswith(".wav") and name not in keep:
            _gh("release", "delete-asset", TAG, name, "--yes")


def last_published(bank: StarterVoices) -> dict | None:
    try:
        return json.loads((bank.folder / "published.json").read_text())
    except (OSError, ValueError):
        return None
