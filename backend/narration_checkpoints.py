"""Short-lived resume checkpoints for narration sections in custom voices.

Built-in (preset) voices already reuse sections through narration_cache. Custom
voices (uploads, designed voices, characters) are personal audio, so their
finished sections are kept only long enough to resume an interrupted export:

* each checkpoint is keyed to the exact voice recording, model choice, text,
  pace, gain and desk settings, so any change re-renders that section;
* a checkpoint is deleted when the narration that used it completes, when the
  source voice is deleted, or after MAX_AGE_SECONDS, whichever comes first;
* the total store is capped at MAX_BYTES (oldest removed first).

The filename is a hash; a small JSON sidecar records only the voice key (for
deletion) and never the script text.
"""
from __future__ import annotations

import hashlib
import json
import os
import tempfile
import time
from pathlib import Path

import numpy as np
import soundfile as sf

from backend.narration_cache import SAMPLE_RATE, render_code_stamp

SCHEMA = "custom-checkpoint-v1"
MAX_AGE_SECONDS = 7 * 24 * 3600
MAX_BYTES = 1024 * 1024 * 1024


def _file_stamp(path) -> list | None:
    if not path:
        return None
    path = Path(path)
    stat = path.stat()
    # Content hash, not just mtime: a re-recorded voice with the same size
    # and a coarse clock must still invalidate.
    return [stat.st_size, hashlib.sha256(path.read_bytes()).hexdigest()]


def section_key(*, voice_key: str, reference, reference_text, voice_state, engine_choice,
                text: str, speed: float, gain: float, desk: dict | None) -> str | None:
    """Return a stable key for a custom-voice section, or None to skip checkpoints."""
    if voice_key.startswith("preset:") or not text.strip():
        return None
    try:
        code = render_code_stamp()
        if code is None:
            return None
        payload = json.dumps({
            "schema": SCHEMA, "render_code": code, "voice": voice_key,
            "reference": _file_stamp(reference), "reference_text": reference_text,
            "voice_state": voice_state, "engine": engine_choice,
            "text": text, "speed": speed, "gain": gain, "desk": desk,
        }, sort_keys=True, separators=(",", ":"), ensure_ascii=False, default=str)
        return hashlib.sha256(payload.encode("utf-8")).hexdigest()
    except (OSError, TypeError, ValueError):
        return None


class CheckpointStore:
    def __init__(self, root: Path, max_bytes: int = MAX_BYTES, max_age: float = MAX_AGE_SECONDS):
        self.root = Path(root)
        self.max_bytes = max_bytes
        self.max_age = max_age

    def _path(self, key: str) -> Path:
        if len(key) != 64 or any(c not in "0123456789abcdef" for c in key):
            raise ValueError("Invalid checkpoint key")
        return self.root / f"{key}.wav"

    def _entries(self):
        if not self.root.is_dir():
            return []
        return [p for p in self.root.glob("*.wav")
                if len(p.stem) == 64 and all(c in "0123456789abcdef" for c in p.stem)]

    def _remove(self, wav: Path):
        wav.unlink(missing_ok=True)
        wav.with_suffix(".json").unlink(missing_ok=True)

    def load(self, key: str | None):
        if key is None:
            return None
        try:
            path = self._path(key)
            if not path.is_file():
                return None
            if time.time() - path.stat().st_mtime > self.max_age:
                self._remove(path)
                return None
            audio, rate = sf.read(path, dtype="float32", always_2d=False)
            if rate != SAMPLE_RATE or audio.ndim != 1 or not len(audio) or not np.isfinite(audio).all():
                self._remove(path)
                return None
            return audio
        except (OSError, RuntimeError, ValueError):
            return None

    def store(self, key: str | None, audio, voice_key: str) -> None:
        if key is None:
            return
        data = np.asarray(audio, dtype=np.float32)
        if data.ndim != 1 or not len(data) or not np.isfinite(data).all() or data.nbytes > self.max_bytes:
            return
        temp_path = None
        try:
            path = self._path(key)
            self.root.mkdir(parents=True, exist_ok=True)
            path.with_suffix(".json").write_text(json.dumps({"voice": voice_key}))
            fd, name = tempfile.mkstemp(suffix=".wav", prefix=".pending-", dir=self.root)
            os.close(fd)
            temp_path = Path(name)
            sf.write(temp_path, data, SAMPLE_RATE, subtype="FLOAT")
            temp_path.replace(path)
            self.prune()
        except (OSError, RuntimeError, ValueError):
            pass  # Checkpoints are an optimisation; never fail a narration over them.
        finally:
            if temp_path is not None:
                try:
                    temp_path.unlink(missing_ok=True)
                except OSError:
                    pass

    def discard(self, keys) -> None:
        for key in keys:
            if key is None:
                continue
            try:
                self._remove(self._path(key))
            except (OSError, ValueError):
                pass

    def purge_voice(self, voice_key: str) -> int:
        """Delete every checkpoint made with a voice (called when it is deleted)."""
        removed = 0
        for wav in self._entries():
            try:
                owner = json.loads(wav.with_suffix(".json").read_text()).get("voice")
            except (OSError, ValueError):
                owner = None  # Unknown owner: remove to be safe.
            if owner is None or owner == voice_key:
                self._remove(wav)
                removed += 1
        return removed

    def prune(self) -> None:
        try:
            now = time.time()
            entries = sorted(self._entries(), key=lambda p: p.stat().st_mtime)
            for wav in list(entries):
                if now - wav.stat().st_mtime > self.max_age:
                    self._remove(wav)
                    entries.remove(wav)
            total = sum(p.stat().st_size for p in entries)
            for wav in entries:
                if total <= self.max_bytes:
                    break
                total -= wav.stat().st_size
                self._remove(wav)
            for orphan in self.root.glob("*.json"):
                if not orphan.with_suffix(".wav").exists():
                    orphan.unlink(missing_ok=True)
        except OSError:
            pass
