"""One per-user model cache shared by browser and native Humperdinck installs.

Never put large models inside replaceable app/Program Files/Application bundles.
Qwen models continue using Hugging Face's existing hub cache by default.
Kokoro and Piper are stored next to that hub in the same cache root.
"""
from __future__ import annotations

import os
from pathlib import Path
import re
import shutil
from uuid import uuid4


def model_home() -> Path:
    """Shared cache root; honoring existing Hugging Face installations by default."""
    custom = os.environ.get("HUMPERDINCK_MODEL_HOME")
    if custom:
        return Path(custom).expanduser().resolve()
    existing = os.environ.get("HF_HOME")
    if existing:
        return Path(existing).expanduser().resolve()
    cache = os.environ.get("XDG_CACHE_HOME")
    return ((Path(cache).expanduser() if cache else Path.home() / ".cache") / "huggingface").resolve()


def configure_hf_home() -> Path:
    """Only redirect HF downloads when the user explicitly chose a shared root.

    Otherwise HF_HOME/HF_HUB_CACHE retain the preexisting Hub defaults so
    already-downloaded multi-gigabyte Qwen models remain discoverable.
    """
    home = model_home()
    if os.environ.get("HUMPERDINCK_MODEL_HOME") and not os.environ.get("HF_HOME") and not os.environ.get("HF_HUB_CACHE"):
        os.environ["HF_HOME"] = str(home)
    return home


def preset_dir(engine: str) -> Path:
    if engine not in ("kokoro", "piper"):
        raise ValueError("Unknown preset engine")
    return model_home() / "humperdinck" / "presets" / engine


def import_legacy_presets(legacy_data: Path) -> list[str]:
    """Copy known original preset weights to shared storage, leaving source intact.

    Copy-once instead of moving protects the current browser/source install if
    any native migration or download gets interrupted. Files use an atomic rename.
    Existing shared files are never overwritten or deleted.
    """
    imported = []
    old_models = Path(legacy_data) / "models"
    if not old_models.is_dir():
        return imported

    for engine in ("kokoro", "piper"):
        source = old_models / engine
        if not source.is_dir() or source.is_symlink():
            continue
        for original in source.iterdir():
            if not original.is_file() or original.is_symlink():
                continue
            if engine == "kokoro" and original.name not in ("kokoro-v1.0.onnx", "voices-v1.0.bin"):
                continue
            if engine == "piper" and not re.fullmatch(r"[a-z]{2}_[A-Z]{2}-[a-z]+-(?:low|medium|high)\.onnx(?:\.json)?", original.name):
                continue
            target_dir = preset_dir(engine)
            target_dir.mkdir(parents=True, exist_ok=True)
            target = target_dir / original.name
            if target.exists():
                continue
            temporary = target.with_name(target.name + "." + uuid4().hex + ".partial")
            try:
                shutil.copy2(original, temporary)
                if not target.exists():
                    temporary.replace(target)
                    imported.append(engine + "/" + original.name)
            finally:
                temporary.unlink(missing_ok=True)
    return imported
