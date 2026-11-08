"""MLX Qwen Base clones from a reference recording, with or without its transcript."""
from pathlib import Path
import numpy as np
import pytest
import soundfile as sf
from backend.qwen_engine import QwenBaseCloner


class Result:
    audio = np.zeros(2400, dtype=np.float32)
    sample_rate = 24000


class Model:
    sample_rate = 24000
    def __init__(self):
        self.requests = []
    def generate(self, **kwargs):
        self.requests.append(kwargs)
        yield Result()


def test_base_cloner_routes_reference_and_transcript(tmp_path, monkeypatch):
    audio = tmp_path / "reference.wav"
    sf.write(audio, np.zeros(24000, dtype=np.float32), 24000)
    output = tmp_path / "out.wav"
    model = Model()
    engine = QwenBaseCloner("mlx-community/Qwen3-TTS-12Hz-0.6B-Base-bf16")
    monkeypatch.setattr(engine, "load", lambda: model)
    engine.synthesize("New words.", audio, output, ref_text="Original words.")
    assert output.is_file()
    assert model.requests == [{"text": "New words.", "ref_audio": str(audio), "ref_text": "Original words."}]


def test_base_clones_without_transcript(tmp_path, monkeypatch):
    # Uploaded and recorded voices have no transcript; clone from the sound alone.
    audio = tmp_path / "reference.wav"
    sf.write(audio, np.zeros(24000, dtype=np.float32), 24000)
    output = tmp_path / "out.wav"
    model = Model()
    engine = QwenBaseCloner("mlx-community/Qwen3-TTS-12Hz-0.6B-Base-bf16")
    monkeypatch.setattr(engine, "load", lambda: model)
    engine.synthesize("New words.", audio, output, ref_text="   ")
    assert output.is_file()
    assert model.requests == [{"text": "New words.", "ref_audio": str(audio), "ref_text": None}]


def test_voice_design_is_not_base_clone():
    with pytest.raises(ValueError, match="Base model"):
        QwenBaseCloner("mlx-community/Qwen3-TTS-12Hz-1.7B-VoiceDesign-8bit")
