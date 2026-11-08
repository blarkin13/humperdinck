#!/usr/bin/env python3
"""Run Humperdinck from source the way the packaged desktop app runs.

Production mode turns on everything the installed app does that the regular
dev copy skips: the first-run setup guide, built-in voice updates, the app's
own engine installs (uv runtimes), MLX cloning choices, and the hidden
publisher. Screens reload as you save, and the server restarts itself when a
backend file changes, so there is no GitHub build to wait for.

Not covered: the app window itself (Tauri), PyInstaller packaging, code signing
and the in-app updater. Those still need a real installer build.

    .venv/bin/python scripts/start_production_mode.py [--fresh] [--own-engines]

--fresh        start with an empty data folder, like a brand-new install
--own-engines  don't reuse the installed app's voice engines (downloads ~3.6 GB)
"""
from __future__ import annotations

import argparse
import os
import shutil
import signal
import subprocess
import sys
import time
import webbrowser
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PY = ROOT / ".venv" / ("Scripts/python.exe" if os.name == "nt" else "bin/python")
APP_SUPPORT = Path.home() / "Library" / "Application Support"
DATA = Path(os.environ.get("HUMPERDINCK_TEST_DATA", APP_SUPPORT / "Humperdinck Test"))
INSTALLED_APP_DATA = APP_SUPPORT / "com.humperdinck.desktop"
# Same extra packages the desktop build adds (see .github/workflows/native-desktop.yml).
# Its own ports, so it can run next to the regular dev copy (8000/5173).
API_PORT, UI_PORT = 8100, 5180
NATIVE_PACKAGES = {"kokoro_onnx": "kokoro-onnx>=0.6,<1", "espeakng_loader": "espeakng-loader",
                   "certifi": "certifi>=2025.1", "uv": "uv>=0.8,<1", "imageio_ffmpeg": "imageio-ffmpeg>=0.5,<1"}


def say(message: str) -> None:
    print(f"[Humperdinck Test] {message}", flush=True)


def ensure_packages() -> None:
    missing = [spec for module, spec in NATIVE_PACKAGES.items()
               if subprocess.run([str(PY), "-c", f"import {module}"], capture_output=True).returncode]
    if missing:
        say("Installing desktop-only packages: " + ", ".join(missing))
        subprocess.run([str(PY), "-m", "pip", "install", "-q", *missing], check=True)


def exclude_from_git(*names: str) -> None:
    common = subprocess.run(["git", "rev-parse", "--git-common-dir"], cwd=ROOT,
                            capture_output=True, text=True).stdout.strip()
    if not common:
        return
    exclude = (ROOT / common).resolve() / "info" / "exclude"
    exclude.parent.mkdir(parents=True, exist_ok=True)
    lines = exclude.read_text().splitlines() if exclude.is_file() else []
    exclude.write_text("\n".join(lines + [f"/{n}" for n in names if f"/{n}" not in lines]) + "\n")


def stage_bundle_layout() -> None:
    """Recreate the two folders the packaged app carries next to its code."""
    tools = ROOT / "runtime-tools"
    tools.mkdir(exist_ok=True)
    uv = PY.parent / ("uv.exe" if os.name == "nt" else "uv")
    target = tools / uv.name
    if not target.exists():
        shutil.copy2(uv, target)
    source = ROOT / "runtime-src"
    if not source.exists():
        source.symlink_to(ROOT, target_is_directory=True)  # runtime-src/backend -> backend
    exclude_from_git("runtime-tools", "runtime-src")


def prepare_data(fresh: bool, own_engines: bool) -> None:
    if fresh and DATA.exists():
        trash = Path.home() / ".Trash" / f"Humperdinck Test {time.strftime('%Y-%m-%d %H.%M.%S')}"
        shutil.move(str(DATA), trash)
        say(f"Moved the old test data to the Trash: {trash.name}")
    DATA.mkdir(parents=True, exist_ok=True)
    runtimes = DATA / "engine-runtimes"
    shared = INSTALLED_APP_DATA / "engine-runtimes"
    if not own_engines and not runtimes.exists() and shared.is_dir():
        runtimes.symlink_to(shared, target_is_directory=True)
        say("Reusing the installed app's voice engines (no 3.6 GB download).")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    parser.add_argument("--fresh", action="store_true")
    parser.add_argument("--own-engines", action="store_true")
    args = parser.parse_args()
    if not PY.exists():
        sys.exit("Run scripts/install.py first")
    ensure_packages()
    stage_bundle_layout()
    prepare_data(args.fresh, args.own_engines)

    env = dict(os.environ, HUMPERDINCK_DATA=str(DATA), HUMPERDINCK_NATIVE_PACKAGE="1",
               HUMPERDINCK_SKIP_STARTUP_UPDATE="1",
               HUMPERDINCK_API=f"http://127.0.0.1:{API_PORT}")
    say(f"Data folder: {DATA}")
    processes = [
        subprocess.Popen([str(PY), "-m", "uvicorn", "scripts.production_mode_app:app", "--host", "127.0.0.1",
                          "--port", str(API_PORT), "--reload", "--reload-dir", "backend", "--reload-dir", "scripts"],
                         cwd=ROOT, env=env),
        subprocess.Popen(["npm", "run", "dev", "--", "--host", "127.0.0.1", "--port", str(UI_PORT), "--strictPort"], cwd=ROOT / "frontend", env=env),
    ]

    def stop(*_):
        for process in processes:
            if process.poll() is None:
                process.terminate()
        sys.exit(0)
    signal.signal(signal.SIGINT, stop)
    signal.signal(signal.SIGTERM, stop)
    time.sleep(4)
    url = f"http://127.0.0.1:{UI_PORT}"
    if not os.environ.get("HUMPERDINCK_TEST_NO_BROWSER"):
        webbrowser.open(url)
    say(f"Running in production mode at {url}. Close this window or press Ctrl+C to stop.")
    while all(p.poll() is None for p in processes):
        time.sleep(1)
    stop()


if __name__ == "__main__":
    main()
