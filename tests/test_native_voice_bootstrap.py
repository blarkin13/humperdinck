"""The native runtime must import its bundled approved voices before serving API."""
import json
from io import BytesIO
from pathlib import Path
from zipfile import ZipFile
import numpy as np
import soundfile as sf
from backend.starter_voice_packs import StarterVoices, stable_id
from desktop.server import install_builtin_voices


def test_native_pack_import_and_keep_deleted_voices(tmp_path, monkeypatch):
    author = tmp_path / "author"
    sample = author / "generated.wav"
    author.mkdir()
    sf.write(str(sample), np.zeros(24000, dtype=np.float32), 24000)
    packer = StarterVoices(author)
    packer.approve("a" * 32, sample, {"name": "Original voice"})
    raw = packer.export(["a" * 32])
    bundle = tmp_path / "frozen"
    (bundle / "voice-packs").mkdir(parents=True)
    (bundle / "voice-packs" / "humperdinck-builtin-voices-v1.zip").write_bytes(raw)
    import sys
    monkeypatch.setattr(sys, "_MEIPASS", str(bundle), raising=False)
    recipient = tmp_path / "recipient"
    assert install_builtin_voices(recipient)["installed"] == 1
    voice = recipient / "voices" / (stable_id("a" * 32) + ".wav")
    voice.unlink()
    assert install_builtin_voices(recipient)["installed"] == 0
    assert not voice.exists()
