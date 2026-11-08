"""Keep Built-In Humperdinck Voices current without a new app release.

The publisher uploads two files to the `voices` release of the public downloads
repository; the website serves them at /voices/latest.json and /voices/pack.zip.
The small JSON says which revision is live, so the pack is only downloaded
when it changed.
"""
from __future__ import annotations

import json
import os
from pathlib import Path
import ssl
from urllib.request import Request, urlopen

from backend.starter_voice_packs import MAX_PACK_BYTES, install

SITE = os.environ.get("HUMPERDINCK_VOICES_URL", "https://humperdinck.studio/voices/")
HEADERS = {"User-Agent": "Humperdinck-Voices/1.0"}


def _context():
    try:
        import certifi
        return ssl.create_default_context(cafile=certifi.where())
    except ImportError:
        return ssl.create_default_context()


def _get(name: str, limit: int) -> bytes:
    with urlopen(Request(SITE + name, headers=HEADERS), timeout=30, context=_context()) as response:
        raw = response.read(limit + 1)
    if len(raw) > limit:
        raise ValueError("Built-in voice download is too large")
    return raw


def applied_revision(data: Path) -> int:
    try:
        return int((Path(data) / "voices" / ".builtin_humperdinck_revision").read_text().strip())
    except (OSError, ValueError):
        return 0


def check(data: Path, fetch=_get) -> dict:
    """Apply the published pack if it is newer than the one on this computer."""
    latest = json.loads(fetch("latest.json", 64 * 1024))
    revision = latest.get("revision") if isinstance(latest, dict) else None
    if not isinstance(revision, int) or revision < 0:
        raise ValueError("Invalid built-in voice feed")
    if revision <= applied_revision(data):
        return {"changed": False, "revision": revision}
    result = install(Path(data), fetch("pack.zip", MAX_PACK_BYTES))
    if result["revision"] != revision:
        raise ValueError("Built-in voice pack does not match the feed")
    return {"changed": True, **result}
