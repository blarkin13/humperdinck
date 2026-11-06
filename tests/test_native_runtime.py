"""Native Qwen and Piper are opt-in, user-data-local installations."""
import os
from pathlib import Path
from backend import native_runtime

def test_engine_runtime_paths_are_per_user(tmp_path, monkeypatch):
    monkeypatch.setenv("HUMPERDINCK_DATA", str(tmp_path / "Humperdinck"))
    python = native_runtime.runtime_python("qwen-mlx")
    assert python.parent.parent.name == ".venv"
    assert (tmp_path / "Humperdinck") in python.parents
    assert python != Path(os.sys.executable)

def test_native_runtime_environment_keeps_existing_shared_hf_cache(tmp_path, monkeypatch):
    monkeypatch.setenv("HUMPERDINCK_DATA", str(tmp_path / "user-data"))
    monkeypatch.setenv("HF_HOME", str(tmp_path / "shared-hf"))
    monkeypatch.setenv("HF_HUB_OFFLINE", "1")
    monkeypatch.setenv("TRANSFORMERS_OFFLINE", "1")
    # Simulate the worker data files PyInstaller includes without MLX downloads.
    package = tmp_path / "unpacked"
    (package / "runtime-src" / "backend").mkdir(parents=True)
    (package / "runtime-src" / "backend" / "worker.py").write_text("pass")
    monkeypatch.setattr(os.sys, "_MEIPASS", str(package), raising=False)
    env = native_runtime.environment(online=True)
    assert env["HF_HOME"] == str(tmp_path / "shared-hf")
    assert "HF_HUB_OFFLINE" not in env
    assert "TRANSFORMERS_OFFLINE" not in env
    assert str(package / "runtime-src") in env["PYTHONPATH"]
