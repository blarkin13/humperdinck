"""Regression tests for local preset narration reuse and invalidation."""
from __future__ import annotations

import numpy as np
from backend.narration_cache import PresetSectionCache, preset_render_key


def model(tmp_path):
    root = tmp_path / "models"
    root.mkdir()
    (root / "model.onnx").write_bytes(b"initial model weights")
    return root


def key(root, *, text="A new story.", voice="preset:kokoro:af_heart",
        speed=1.0, gain=0.0, desk=None):
    return preset_render_key(model_root=root, voice_key=voice, text=text,
                             speed=speed, gain=gain, desk=desk)


def test_cache_only_accepts_present_preset_models(tmp_path):
    root = model(tmp_path)
    assert len(key(root)) == 64
    assert preset_render_key(model_root=root, voice_key="upload:private",
                             text="secret", speed=1, gain=0, desk=None) is None
    assert key(root, text="   ") is None
    assert key(tmp_path / "missing") is None


def test_render_key_is_stable_and_invalidates_text_voice_pace_gain_desk_and_model(tmp_path):
    root = model(tmp_path)
    original = key(root, desk={"enabled": True, "eq": [0, 1]})
    assert original == key(root, desk={"eq": [0, 1], "enabled": True})
    assert original != key(root, text="Different words", desk={"enabled": True, "eq": [0, 1]})
    assert original != key(root, voice="preset:kokoro:am_adam", desk={"enabled": True, "eq": [0, 1]})
    assert original != key(root, speed=1.25, desk={"enabled": True, "eq": [0, 1]})
    assert original != key(root, gain=1.0, desk={"enabled": True, "eq": [0, 1]})
    assert original != key(root, desk={"enabled": False, "eq": [0, 1]})
    (root / "model.onnx").write_bytes(b"replacement model weights with another length")
    assert original != key(root, desk={"enabled": True, "eq": [0, 1]})


def test_float_cache_roundtrip_survives_restart_and_reuses_identical_samples(tmp_path):
    root = model(tmp_path)
    token = key(root)
    directory = tmp_path / "cache"
    audio = np.linspace(-0.33, 0.34, 257, dtype=np.float32)
    first = PresetSectionCache(directory)
    assert first.load(token) is None
    first.store(token, audio)
    second = PresetSectionCache(directory)  # A new backend process can reuse it.
    restored = second.load(token)
    assert restored is not None
    np.testing.assert_array_equal(restored, audio)
    assert len(list(directory.glob("*.wav"))) == 1
    assert not list(directory.glob(".pending*"))


def test_invalid_or_corrupted_cache_misses_safely(tmp_path):
    root = model(tmp_path)
    token = key(root)
    cache = PresetSectionCache(tmp_path / "cache")
    assert cache.load("../../unexpected") is None
    cache.store(token, np.array([np.nan], dtype=np.float32))
    assert cache.load(token) is None
    cache.root.mkdir(parents=True)
    (cache.root / (token + ".wav")).write_bytes(b"damaged wav")
    assert cache.load(token) is None
    cache.store(token, np.array([0.3, -0.2], dtype=np.float32))
    np.testing.assert_array_equal(cache.load(token), np.array([0.3, -0.2], dtype=np.float32))


def test_cache_does_not_store_oversize_and_evicts_oldest(tmp_path):
    root = model(tmp_path)
    first_key, second_key = key(root, text="first"), key(root, text="second")
    cache = PresetSectionCache(tmp_path / "cache", max_bytes=1500)
    cache.store(first_key, np.ones(250, dtype=np.float32))
    assert cache.load(first_key) is not None
    cache.store(second_key, np.ones(250, dtype=np.float32) * -0.5)
    assert cache.load(first_key) is None
    assert cache.load(second_key) is not None
    cache.store(key(root, text="huge"), np.ones(10000, dtype=np.float32))
    assert len(list(cache.root.glob("*.wav"))) == 1



def test_packaged_helper_can_key_cache_without_python_source_files(tmp_path, monkeypatch):
    import sys
    import backend.narration_cache as module
    root = model(tmp_path)
    monkeypatch.setattr(module, "__file__", str(tmp_path / "bundled" / "narration_cache.py"))
    # In a source checkout missing renderer files, safely decline caching.
    assert key(root) is None
    # A bundled app uses the installed executable identity for invalidation.
    monkeypatch.setattr(sys, "frozen", True, raising=False)
    assert len(key(root)) == 64


def test_full_narration_reuses_unchanged_preset_sections_without_reinvoking_engine(tmp_path, monkeypatch):
    """Exercise the real run_multi integration with a synthetic tiny audio engine."""
    import soundfile as sf
    from backend import app as api
    from types import SimpleNamespace

    root = model(tmp_path)
    (tmp_path / "outputs").mkdir()
    monkeypatch.setattr(api, "DATA", tmp_path)
    monkeypatch.setattr(api, "preset_section_cache", PresetSectionCache(tmp_path / "render-cache"))
    monkeypatch.setattr(api, "jobs", {})
    monkeypatch.setattr(api, "settings", SimpleNamespace(load=lambda: {"clone": {"engine": "unused"}}))
    monkeypatch.setattr(api.catalog, "preset_path", lambda _engine, _voice: root)
    calls = []

    def synth(engine, voice, output, text, *, on_progress=None, speed=1):
        calls.append((engine, voice, text, speed))
        sf.write(output, np.array([0.1, 0.2, -0.3], dtype=np.float32), 24_000)

    monkeypatch.setattr(api.engines, "preset", synth)

    def run(job_id, text="A new story.", speed=1):
        api.jobs[job_id] = {"status": "queued", "progress": 0}
        request = api.MultiNarrationRequest(
            blocks=[{"text": text, "voice_key": "preset:kokoro:af_heart", "speed": speed}],
            format="wav")
        api.run_multi(job_id, request, [(None, ("kokoro", "af_heart"))])
        assert api.jobs[job_id]["status"] == "complete", api.jobs[job_id]["message"]
        return (tmp_path / "outputs" / f"{job_id}.wav").read_bytes()

    first = run("a" * 32)
    second = run("b" * 32)
    assert first == second  # PCM output is reproducible with cache hit.
    assert len(calls) == 1
    run("c" * 32, text="Updated text.")
    run("d" * 32, speed=1.1)
    assert len(calls) == 3
