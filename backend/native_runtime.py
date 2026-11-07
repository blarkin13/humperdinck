"""Opt-in, per-user native Qwen runtimes (Apple Silicon MLX, PyTorch).

The desktop installer bundles the tiny uv executable, not multi-gigabyte models.
uv installs Python 3.12 and model packages in the user's application data, never
in /Applications, Program Files, or the replaceable Tauri/PyInstaller bundle.
"""
from __future__ import annotations

import os
from pathlib import Path
import shutil
import subprocess
import sys

from backend import catalog, shared_models

SUPPORTED = frozenset(("qwen-mlx", "qwen-torch"))


def supported(engine: str) -> bool:
    return engine in SUPPORTED and catalog.supported(engine)


def root() -> Path:
    if not os.environ.get("HUMPERDINCK_DATA"):
        raise RuntimeError("Native user-data directory was not configured")
    return Path(os.environ["HUMPERDINCK_DATA"]).resolve() / "engine-runtimes"


def runtime_python(engine: str) -> Path:
    home = root() / engine / ".venv"
    return home / ("Scripts/python.exe" if os.name == "nt" else "bin/python")


def source_root() -> Path:
    base = Path(getattr(sys, "_MEIPASS", Path(__file__).resolve().parents[1]))
    return base / "runtime-src"


def uv_binary() -> Path:
    name = "uv.exe" if os.name == "nt" else "uv"
    base = Path(getattr(sys, "_MEIPASS", Path(__file__).resolve().parents[1]))
    path = base / "runtime-tools" / name
    if not path.is_file():
        raise RuntimeError("The native application is missing its bundled Python environment installer (uv)")
    return path


def environment(*, online: bool = False) -> dict:
    env = dict(os.environ)
    base = root()
    env["UV_PYTHON_INSTALL_DIR"] = str(base / "python")
    env["UV_CACHE_DIR"] = str(base / "uv-cache")
    env["UV_NO_PROGRESS"] = "1"
    runtime = source_root()
    if not (runtime / "backend" / "worker.py").is_file():
        raise RuntimeError("The bundled Qwen worker sources are missing")
    env["PYTHONPATH"] = str(runtime) + (os.pathsep + env["PYTHONPATH"] if env.get("PYTHONPATH") else "")
    shared_models.configure_hf_home()
    if online:
        env.pop("HF_HUB_OFFLINE", None)
        env.pop("TRANSFORMERS_OFFLINE", None)
    return env


def _execute(command: list[str], env: dict):
    subprocess.run(command, check=True, env=env, timeout=1200, cwd=str(root()))


def free_space_gb(path: Path) -> float:
    """Check the volume holding the shared model cache, not just the app."""
    target = path
    while not target.exists():
        if target.parent == target:
            raise RuntimeError("Cannot determine model cache volume")
        target = target.parent
    return shutil.disk_usage(target).free / 1024**3


def minimum_free_gb(engine: str, model: str | None = None) -> float:
    # Full-size checkpoints, Xet reconstruction files, Python wheels and the
    # separate managed runtime can temporarily coexist during installation.
    size = catalog.ENGINES[engine]["models"][model]["size_gb"] if model else 0.0
    overhead = 8.0 if engine == "qwen-torch" else 6.0 if engine == "qwen-mlx" else 2.0
    return max(overhead, float(size) * 2 + 3.0)


def require_disk_space(engine: str, model: str | None = None) -> None:
    target = (catalog.hf_cache() if model and engine == "qwen-mlx"
              else root())
    available = free_space_gb(target)
    needed = minimum_free_gb(engine, model)
    if available < needed:
        raise RuntimeError(
            f"Not enough free disk space for {engine}"
            + (f" / {model}" if model else "") + ". "
            f"About {available:.1f} GB is available on the destination drive; "
            f"allow at least {needed:.1f} GB for the model, runtime and temporary files. "
            "Free disk space and retry. Incomplete Hugging Face downloads may "
            "also be occupying the shared model cache."
        )


def install(engine: str, model: str | None = None) -> None:
    if not supported(engine):
        raise RuntimeError(f"{engine} is not available in this native installer")
    if model and model not in catalog.ENGINES[engine]["models"]:
        raise ValueError("Unknown model selected")
    base = root()
    require_disk_space(engine, model)
    base.mkdir(parents=True, exist_ok=True)
    uv = str(uv_binary())
    env = environment(online=True)
    py = runtime_python(engine)
    if not py.exists():
        print("STEP Installing isolated Python 3.12 runtime for " + engine, flush=True)
        # uv may download a managed Python. This deliberately does not modify
        # any system installation, existing project, or source-based environment.
        _execute([uv, "venv", "--python", "3.12", str(py.parent.parent)], env)
    print("STEP Installing " + catalog.ENGINES[engine]["label"] + " packages", flush=True)
    # PyPI's Windows/Linux PyTorch is CPU-only. --torch-backend auto picks the
    # CUDA build matching the installed NVIDIA driver, or CPU when there is none.
    torch_backend = ["--torch-backend", "auto"] if engine == "qwen-torch" else []
    _execute([uv, "pip", "install", "--python", str(py), "--upgrade", *torch_backend,
              *catalog.ENGINES[engine]["packages"]], env)
    print("STEP Verifying installed engine", flush=True)
    modules = catalog.ENGINES[engine]["imports"]
    _execute([str(py), "-c", "import importlib; " +
              "; ".join(f"importlib.import_module({module!r})" for module in modules)], env)
    if model:
        # A user may have freed or consumed space while dependencies installed.
        require_disk_space(engine, model)
        print(f"STEP Downloading {model} to shared model cache", flush=True)
        _execute([str(py), "-c",
                  "import sys; from huggingface_hub import snapshot_download; snapshot_download(sys.argv[1])",
                  model], env)
    print("STEP Engine and model installation complete", flush=True)
