"""Native + source installations reuse one per-user model location."""
import os

from backend import shared_models, catalog


def test_model_home_matches_existing_hugging_face_cache(tmp_path, monkeypatch):
    home = tmp_path / "shared-hf"
    monkeypatch.delenv("HUMPERDINCK_MODEL_HOME", raising=False)
    monkeypatch.setenv("HF_HOME", str(home))
    monkeypatch.delenv("HF_HUB_CACHE", raising=False)
    assert shared_models.model_home() == home
    assert catalog.hf_cache() == home / "hub"
    assert catalog.preset_path("kokoro", "af_heart") == home / "humperdinck" / "presets" / "kokoro"


def test_explicit_model_home_is_shared_with_hf(tmp_path, monkeypatch):
    home = tmp_path / "new-model-store"
    monkeypatch.setenv("HUMPERDINCK_MODEL_HOME", str(home))
    monkeypatch.delenv("HF_HOME", raising=False)
    monkeypatch.delenv("HF_HUB_CACHE", raising=False)
    assert shared_models.configure_hf_home() == home
    assert os.environ["HF_HOME"] == str(home)
    assert catalog.hf_cache() == home / "hub"
    assert catalog.preset_path("piper", "") == home / "humperdinck" / "presets" / "piper"


def test_migrate_old_preset_models_without_removing_user_data(tmp_path, monkeypatch):
    home = tmp_path / "shared"
    monkeypatch.setenv("HF_HOME", str(home))
    monkeypatch.delenv("HUMPERDINCK_MODEL_HOME", raising=False)
    old = tmp_path / "source-data"
    voice = old / "models" / "piper"
    voice.mkdir(parents=True)
    original = voice / "en_GB-alan-medium.onnx"
    original.write_bytes(b"legacy weights")
    (voice / "notes.txt").write_text("leave this alone")
    moved = shared_models.import_legacy_presets(old)
    target = catalog.preset_path("piper", "") / original.name
    assert moved == ["piper/en_GB-alan-medium.onnx"]
    assert target.read_bytes() == b"legacy weights"
    assert original.read_bytes() == b"legacy weights"
    assert shared_models.import_legacy_presets(old) == []
    target.write_bytes(b"new version")
    assert shared_models.import_legacy_presets(old) == []
    assert target.read_bytes() == b"new version"


def test_no_unknown_models_are_imported(tmp_path, monkeypatch):
    monkeypatch.setenv("HF_HOME", str(tmp_path / "shared"))
    monkeypatch.delenv("HUMPERDINCK_MODEL_HOME", raising=False)
    old = tmp_path / "legacy"
    path = old / "models" / "kokoro"
    path.mkdir(parents=True)
    (path / "custom-secret.txt").write_text("do not transfer")
    assert shared_models.import_legacy_presets(old) == []
    assert not (shared_models.preset_dir("kokoro") / "custom-secret.txt").exists()
