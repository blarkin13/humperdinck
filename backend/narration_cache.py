"""Bounded, local-only cache for unchanged *preset* narration sections.

The cache holds processed dry voice sections, never source recordings, login data,
or mixed sound effects. Custom/cloned voices deliberately bypass this cache until
their revision and consent/deletion lifecycle can be verified.
"""
from __future__ import annotations

import hashlib
import json
import os
import sys
import tempfile
from pathlib import Path

import numpy as np
import soundfile as sf

CACHE_VERSION = "preset-render-v1"
SAMPLE_RATE = 24_000
MAX_CACHE_BYTES = 256 * 1024 * 1024
CODE_FILES = ("app.py", "catalog.py", "engines.py", "engine.py", "worker.py", "kokoro_engine.py",
              "shared_models.py", "audio_fx.py", "native_models.py")


def render_code_stamp() -> str | None:
    """Hash of the rendering code, so an app update invalidates reused speech."""
    code_stamp = hashlib.sha256()
    source_dir = Path(__file__).resolve().parent
    for filename in CODE_FILES:
        code_stamp.update(filename.encode())
        source = source_dir / filename
        if source.is_file():
            code_stamp.update(source.read_bytes())
        elif getattr(sys, "frozen", False) or os.getenv("HUMPERDINCK_NATIVE_PACKAGE") == "1":
            # Packaged Python helpers generally contain bytecode, not .py
            # source files. Use the exact installed helper binary identity
            # so a native update invalidates old rendered speech.
            executable = Path(sys.executable)
            stamp = executable.stat()
            code_stamp.update(json.dumps(
                [str(executable), stamp.st_size, stamp.st_mtime_ns]).encode())
            break
        else:
            return None
    return code_stamp.hexdigest()


def preset_render_key(*, model_root: Path, voice_key: str, text: str,
                      speed: float, gain: float, desk: dict | None) -> str | None:
    """Return a stable key or None if the model is not present/inspectable.

    Model size+mtime metadata and the rendering code hash prevent reusing speech
    after ordinary engine/model updates. No file paths or input text are
    written to the cache filename. The model folder must actually exist.
    """
    if not voice_key.startswith("preset:") or not text.strip():
        return None
    root = Path(model_root)
    if not root.is_dir():
        return None
    try:
        model_files = sorted(p for p in root.rglob("*") if p.is_file())
        if not model_files or len(model_files) > 5000:
            return None
        model_stamp = []
        for path in model_files:
            stat = path.stat()
            model_stamp.append([str(path.relative_to(root)), stat.st_size, stat.st_mtime_ns])
        code_stamp = render_code_stamp()
        if code_stamp is None:
            return None
        payload = json.dumps({
            "schema": CACHE_VERSION, "model_files": model_stamp,
            "render_code": code_stamp, "voice": voice_key,
            "text": text, "speed": speed, "gain": gain, "desk": desk,
        }, sort_keys=True, separators=(",", ":"), ensure_ascii=False)
        return hashlib.sha256(payload.encode("utf-8")).hexdigest()
    except (OSError, TypeError, ValueError):
        # Cache failure must never break ordinary narration.
        return None


class PresetSectionCache:
    def __init__(self, root: Path, max_bytes: int = MAX_CACHE_BYTES):
        self.root = Path(root)
        self.max_bytes = max_bytes

    def _path(self, key: str) -> Path:
        if len(key) != 64 or any(c not in "0123456789abcdef" for c in key):
            raise ValueError("Invalid render cache key")
        return self.root / f"{key}.wav"

    def load(self, key: str | None):
        if key is None:
            return None
        try:
            path = self._path(key)
            if not path.is_file() or path.stat().st_size > self.max_bytes:
                return None
            audio, rate = sf.read(path, dtype="float32", always_2d=False)
            if rate != SAMPLE_RATE or audio.ndim != 1 or not len(audio) or not np.isfinite(audio).all():
                path.unlink(missing_ok=True)
                return None
            os.utime(path, None)  # LRU recency without altering actual waveform.
            return audio
        except (OSError, RuntimeError, ValueError):
            return None

    def store(self, key: str | None, audio) -> None:
        if key is None:
            return
        data = np.asarray(audio, dtype=np.float32)
        if data.ndim != 1 or not len(data) or not np.isfinite(data).all():
            return
        # Do not make huge intermediates or multi-hour renders permanent.
        if data.nbytes + 128 > self.max_bytes:
            return
        path = self._path(key)
        temp_path = None
        try:
            self.root.mkdir(parents=True, exist_ok=True)
            fd, name = tempfile.mkstemp(suffix=".wav", prefix=".pending-", dir=self.root)
            os.close(fd)
            temp_path = Path(name)
            # FLOAT preserves the current render exactly; PCM_16 would change it.
            sf.write(temp_path, data, SAMPLE_RATE, subtype="FLOAT")
            temp_path.replace(path)  # Crash-safe commit; readers never see partial WAV.
            self._prune()
        except (OSError, RuntimeError, ValueError):
            pass  # Rendering may proceed with no cache.
        finally:
            if temp_path is not None:
                try:
                    temp_path.unlink(missing_ok=True)
                except OSError:
                    pass  # An unwritable cache must never abort narration.

    def _prune(self):
        files = sorted((p for p in self.root.glob("*.wav")
                        if len(p.stem) == 64 and all(c in "0123456789abcdef" for c in p.stem)),
                       key=lambda p: p.stat().st_mtime_ns)
        total = sum(p.stat().st_size for p in files)
        for path in files:
            if total <= self.max_bytes:
                break
            size = path.stat().st_size
            path.unlink(missing_ok=True)
            total -= size
