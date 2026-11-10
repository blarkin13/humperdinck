"""Custom-voice resume checkpoints: invalidation, lifecycle and privacy limits."""
from __future__ import annotations

import os
import time

import numpy as np
import soundfile as sf

from backend.narration_checkpoints import CheckpointStore, section_key


def reference(tmp_path, data=b"voice one"):
    path = tmp_path / "voice.wav"
    path.write_bytes(data)
    return path


def key(ref, **changes):
    args = dict(voice_key="upload:abc", reference=ref, reference_text="Hello there.",
                voice_state={"refine": 1}, engine_choice={"engine": "qwen-mlx", "model": "m"},
                text="Chapter one.", speed=1.0, gain=0.0, desk=None)
    args.update(changes)
    return section_key(**args)


def audio(n=2400, value=0.1):
    return np.full(n, value, dtype=np.float32)


def test_presets_and_blank_text_never_checkpoint(tmp_path):
    ref = reference(tmp_path)
    assert key(ref, voice_key="preset:kokoro:af_heart") is None
    assert key(ref, text="  ") is None
    assert len(key(ref)) == 64


def test_key_changes_with_every_input_including_rerecorded_voice(tmp_path):
    ref = reference(tmp_path)
    base = key(ref)
    assert base == key(ref)
    for change in ({"text": "Chapter two."}, {"speed": 1.1}, {"gain": 2.0},
                   {"desk": {"eq": 1}}, {"voice_state": {"refine": 2}},
                   {"engine_choice": {"engine": "qwen-mlx", "model": "other"}},
                   {"reference_text": "Different"}, {"voice_key": "upload:def"}):
        assert key(ref, **change) != base, change
    ref.write_bytes(b"voice two")  # Same size, new recording.
    assert key(ref) != base


def test_store_load_roundtrip_is_exact_and_discard_removes(tmp_path):
    store = CheckpointStore(tmp_path / "cp")
    k = key(reference(tmp_path))
    sample = np.linspace(-0.5, 0.5, 4800, dtype=np.float32)
    store.store(k, sample, "upload:abc")
    assert np.array_equal(store.load(k), sample)
    store.discard([k, None])
    assert store.load(k) is None
    assert not list((tmp_path / "cp").iterdir())


def test_sidecar_never_contains_script_text(tmp_path):
    store = CheckpointStore(tmp_path / "cp")
    k = key(reference(tmp_path), text="Top secret manuscript line.")
    store.store(k, audio(), "upload:abc")
    sidecar = (tmp_path / "cp" / f"{k}.json").read_text()
    assert "secret" not in sidecar and "upload:abc" in sidecar


def test_purge_voice_removes_only_that_voice(tmp_path):
    store = CheckpointStore(tmp_path / "cp")
    ref = reference(tmp_path)
    mine, other = key(ref), key(ref, voice_key="character:xyz")
    store.store(mine, audio(), "upload:abc")
    store.store(other, audio(), "character:xyz")
    assert store.purge_voice("upload:abc") == 1
    assert store.load(mine) is None
    assert store.load(other) is not None


def test_expired_and_oversized_checkpoints_are_removed(tmp_path):
    store = CheckpointStore(tmp_path / "cp", max_age=60)
    ref = reference(tmp_path)
    old = key(ref)
    store.store(old, audio(), "upload:abc")
    stale = time.time() - 120
    os.utime(tmp_path / "cp" / f"{old}.wav", (stale, stale))
    assert store.load(old) is None

    small = CheckpointStore(tmp_path / "small", max_bytes=30_000)
    first, second = key(ref, text="One."), key(ref, text="Two.")
    small.store(first, audio(4800), "upload:abc")
    past = time.time() - 30
    os.utime(tmp_path / "small" / f"{first}.wav", (past, past))
    small.store(second, audio(4800), "upload:abc")
    assert small.load(first) is None  # Oldest evicted to stay under the cap.
    assert small.load(second) is not None


def test_corrupt_checkpoint_is_bypassed(tmp_path):
    store = CheckpointStore(tmp_path / "cp")
    k = key(reference(tmp_path))
    (tmp_path / "cp").mkdir()
    sf.write(tmp_path / "cp" / f"{k}.wav", audio(), 16000)  # Wrong rate.
    assert store.load(k) is None
    assert not (tmp_path / "cp" / f"{k}.wav").exists()


def test_try_again_after_failure_resumes_custom_voice_sections_then_cleans_up(tmp_path, monkeypatch):
    """Real run_multi: a failed export keeps finished custom sections; the retry skips them."""
    from types import SimpleNamespace
    from backend import app as api

    (tmp_path / "outputs").mkdir()
    ref = reference(tmp_path)
    store = CheckpointStore(tmp_path / "render-checkpoints")
    monkeypatch.setattr(api, "DATA", tmp_path)
    monkeypatch.setattr(api, "section_checkpoints", store)
    monkeypatch.setattr(api, "jobs", {})
    monkeypatch.setattr(api, "voice_meta", lambda: {})
    monkeypatch.setattr(api, "settings", SimpleNamespace(load=lambda: {"clone": {"engine": "qwen-mlx", "model": "m"}}))
    calls, fail = [], {"text": "Second part."}

    def clone(choice, output, text, reference_path, reference_text, *, on_progress=None):
        calls.append(text)
        if text == fail["text"]:
            raise RuntimeError("engine crashed")
        sf.write(output, np.array([0.1, 0.2, -0.3], dtype=np.float32), 24_000)

    monkeypatch.setattr(api.engines, "clone", clone)
    request = api.MultiNarrationRequest(blocks=[
        {"text": "First part.", "voice_key": "upload:abc"},
        {"text": "Second part.", "voice_key": "upload:abc"}], format="wav")
    refs = [(ref, "Hello there.")] * 2

    api.jobs["a" * 32] = {"status": "queued", "progress": 0}
    api.run_multi("a" * 32, request, refs)
    assert api.jobs["a" * 32]["status"] == "failed"
    assert calls == ["First part.", "Second part."]
    assert len(list((tmp_path / "render-checkpoints").glob("*.wav"))) == 1

    fail["text"] = None
    api.jobs["b" * 32] = {"status": "queued", "progress": 0}
    api.run_multi("b" * 32, request, refs)
    job = api.jobs["b" * 32]
    assert job["status"] == "complete", job["message"]
    assert job["resumed_sections"] == 1
    assert calls == ["First part.", "Second part.", "Second part."]  # First part not re-rendered.
    # The finished export holds the audio now; no personal-voice checkpoints remain.
    assert not list((tmp_path / "render-checkpoints").glob("*.wav"))


def test_deleting_a_voice_purges_its_checkpoints(tmp_path, monkeypatch):
    from backend import app as api
    store = CheckpointStore(tmp_path / "cp")
    monkeypatch.setattr(api, "section_checkpoints", store)
    k = key(reference(tmp_path), voice_key="character:" + "c" * 32)
    store.store(k, audio(), "character:" + "c" * 32)
    monkeypatch.setattr(api.characters, "delete", lambda _id: True)
    api.delete_character("c" * 32)
    assert store.load(k) is None
