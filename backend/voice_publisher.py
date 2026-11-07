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
    approved = [v["source_voice_id"] for v in bank.list()]
    if not approved:
        raise ValueError("Approve at least one voice before publishing.")
    revision = int(time.time())
    raw = bank.export(approved, revision)
    if _gh("release", "view", TAG).returncode != 0:
        # A prerelease never becomes the "latest" app release the website offers.
        made = _gh("release", "create", TAG, "--prerelease", "--title", "Built-In Humperdinck Voices",
                   "--notes", "Voice pack the app downloads automatically. Managed by the Humperdinck publisher.")
        if made.returncode != 0:
            raise RuntimeError("Could not create the voices release: " + made.stderr.strip())
    with tempfile.TemporaryDirectory() as folder:
        pack = Path(folder) / "pack.zip"
        latest = Path(folder) / "latest.json"
        pack.write_bytes(raw)
        latest.write_text(json.dumps({"revision": revision, "voices": len(approved)}))
        # Upload the pack before the pointer, so apps never see a revision whose pack is missing.
        for file in (pack, latest):
            sent = _gh("release", "upload", TAG, str(file), "--clobber")
            if sent.returncode != 0:
                raise RuntimeError("Upload failed: " + sent.stderr.strip())
    record = {"revision": revision, "voices": len(approved),
              "published_at": time.strftime("%Y-%m-%d %H:%M", time.localtime(revision))}
    (bank.folder / "published.json").write_text(json.dumps(record))
    return record


def last_published(bank: StarterVoices) -> dict | None:
    try:
        return json.loads((bank.folder / "published.json").read_text())
    except (OSError, ValueError):
        return None
