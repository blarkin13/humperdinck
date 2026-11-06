"""Never start multi-GB native MLX downloads on an almost-full disk."""
from pathlib import Path
import pytest
from backend import native_runtime


def test_preflight_rejects_low_space(tmp_path, monkeypatch):
    monkeypatch.setenv("HUMPERDINCK_DATA", str(tmp_path))
    monkeypatch.setattr(native_runtime, "free_space_gb", lambda path: 2.0)
    with pytest.raises(RuntimeError, match="Not enough free disk space"):
        native_runtime.require_disk_space(
            "qwen-mlx", "mlx-community/Qwen3-TTS-12Hz-0.6B-Base-bf16"
        )


def test_preflight_accepts_healthy_space(tmp_path, monkeypatch):
    monkeypatch.setenv("HUMPERDINCK_DATA", str(tmp_path))
    monkeypatch.setattr(native_runtime, "free_space_gb", lambda path: 40.0)
    native_runtime.require_disk_space(
        "qwen-mlx", "mlx-community/Qwen3-TTS-12Hz-0.6B-Base-bf16"
    )


def test_runtime_install_has_writable_user_data(tmp_path, monkeypatch):
    monkeypatch.setenv("HUMPERDINCK_DATA", str(tmp_path))
    assert native_runtime.root().parent == tmp_path
