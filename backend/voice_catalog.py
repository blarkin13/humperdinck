"""Humperdinck Voice Gallery: optional voices people choose to download.

The publisher lists them in /voices/catalog.json with one sample file each.
Downloaded gallery voices keep updating, but are never removed from a
computer when they leave the gallery, because the person chose them.
"""
from __future__ import annotations

from hashlib import sha256
from io import BytesIO
import json
from pathlib import Path

import soundfile as sf

from backend.builtin_voice_updates import SITE, _get
from backend.starter_voice_packs import MAX_SAMPLE_BYTES, SENTENCE

ORIGIN = "humperdinck-catalog"


def _catalog(fetch) -> list[dict]:
    document = json.loads(fetch("catalog.json", 1024 * 1024))
    voices = document.get("voices") if isinstance(document, dict) else None
    if not isinstance(voices, list):
        raise ValueError("Invalid voice gallery")
    valid = []
    for item in voices:
        uid = str(item.get("voice_id", ""))
        if len(uid) == 32 and all(c in "0123456789abcdef" for c in uid) and item.get("file") == f"catalog-{uid}.wav":
            valid.append(item)
    return valid


def _names(data: Path) -> tuple[Path, dict]:
    path = Path(data) / "voices" / "names.json"
    try:
        names = json.loads(path.read_text())
    except (OSError, ValueError):
        names = {}
    return path, names if isinstance(names, dict) else {}


def _installed(data: Path, names: dict, uid: str) -> bool:
    return (names.get(uid) or {}).get("origin") == ORIGIN and (Path(data) / "voices" / f"{uid}.wav").is_file()


def listing(data: Path, fetch=_get) -> list[dict]:
    _, names = _names(data)
    return [{"voice_id": v["voice_id"], "name": str(v.get("name", "Voice"))[:120],
             "category": str(v.get("category", ""))[:60], "duration": v.get("duration"),
             "sample_url": SITE + v["file"], "installed": _installed(data, names, v["voice_id"])}
            for v in _catalog(fetch)]


def _save(data: Path, item: dict, fetch) -> None:
    audio = fetch(item["file"], MAX_SAMPLE_BYTES)
    if sha256(audio).hexdigest() != item.get("sha256"):
        raise ValueError("The downloaded voice was damaged. Try again.")
    info = sf.info(BytesIO(audio))
    if info.samplerate != 24000 or info.channels != 1 or not 1 <= info.duration <= 60:
        raise ValueError("The downloaded voice is not a valid sample")
    folder = Path(data) / "voices"
    folder.mkdir(parents=True, exist_ok=True)
    path = folder / f"{item['voice_id']}.wav"
    tmp = path.with_suffix(".tmp")
    tmp.write_bytes(audio)
    tmp.replace(path)
    names_path, names = _names(data)
    names[item["voice_id"]] = {"name": str(item.get("name") or "Voice")[:120],
                               "category": str(item.get("category") or "")[:60],
                               "origin": ORIGIN, "reference_text": SENTENCE, "sha256": item["sha256"]}
    tmp = names_path.with_suffix(".tmp")
    tmp.write_text(json.dumps(names, indent=2))
    tmp.replace(names_path)


def download(data: Path, uid: str, fetch=_get) -> dict:
    item = next((v for v in _catalog(fetch) if v["voice_id"] == uid), None)
    if item is None:
        raise LookupError("That voice is no longer in the gallery")
    _, names = _names(data)
    if uid in names and names[uid].get("origin") != ORIGIN:
        raise ValueError("You already have this voice")
    _save(data, item, fetch)
    return {"voice_id": uid, "name": item.get("name")}


def refresh_installed(data: Path, fetch=_get) -> list[str]:
    """Update gallery voices this person downloaded, if the publisher changed them."""
    _, names = _names(data)
    if not any((v or {}).get("origin") == ORIGIN for v in names.values() if isinstance(v, dict)):
        return []
    updated = []
    for item in _catalog(fetch):
        uid = item["voice_id"]
        if _installed(data, names, uid) and (names[uid].get("sha256") != item.get("sha256")
                                             or names[uid].get("name") != item.get("name")):
            _save(data, item, fetch)
            _, names = _names(data)
            updated.append(uid)
    return updated
