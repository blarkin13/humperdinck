#!/usr/bin/env python3
"""FastAPI + the compiled React UI, packaged as a local-only native sidecar.

This process is a first-stage desktop shell. It deliberately does not enable
LAN/remote access, source-tree updates, or self-installing ML environments.
"""
from __future__ import annotations

import argparse
import os
from pathlib import Path
import sys


def frontend_directory() -> Path:
    base = Path(getattr(sys, "_MEIPASS", Path(__file__).resolve().parents[1]))
    return base / "frontend" / "dist"


def install_builtin_voices(data_dir: Path) -> dict:
    """Import approved samples at startup without overwriting personal voices."""
    from backend import voice_packs
    if not voice_packs.BUNDLED:
        print("Built-In Humperdinck Voices: not included in this version", flush=True)
        return {"total_in_pack": 0, "installed": 0, "skipped": True}
    base = Path(getattr(sys, "_MEIPASS", Path(__file__).resolve().parents[1]))
    archive = base / "voice-packs" / "humperdinck-builtin-voices-v1.zip"
    if not archive.is_file():
        raise RuntimeError("Built-In Humperdinck Voices are missing from the native app bundle")
    from backend.starter_voice_packs import install
    result = install(data_dir, archive.read_bytes())
    print(f"Built-In Humperdinck Voices: {result['total_in_pack']} included, "
          f"{result['installed']} newly imported", flush=True)
    return result


def install_builtin_sounds(data_dir: Path) -> dict:
    """Install approved nature recordings into user storage without overwriting uploads."""
    base = Path(getattr(sys, "_MEIPASS", Path(__file__).resolve().parents[1]))
    archive = base / "sound-packs" / "humperdinck-native-cc0-sounds-v1.zip"
    if not archive.is_file():
        raise RuntimeError("Humperdinck Nature Sound Pack missing from native app bundle")
    from backend.sound_effects import SoundEffects
    result = SoundEffects(data_dir).import_pack(archive.read_bytes())
    print(f"Humperdinck Sound Effects: {result['count']} newly imported; "
          f"{len(result['skipped'])} already installed", flush=True)
    return result


def hide_child_consoles() -> None:
    """On Windows, start every helper (uv, ffmpeg, engine workers) without a terminal window."""
    if sys.platform != "win32":
        return
    import subprocess
    original = subprocess.Popen.__init__

    def init(self, *args, **kwargs):
        kwargs["creationflags"] = kwargs.get("creationflags", 0) | subprocess.CREATE_NO_WINDOW
        original(self, *args, **kwargs)
    subprocess.Popen.__init__ = init


def main() -> None:
    hide_child_consoles()
    if "--native-runtime-check" in sys.argv:
        from backend import native_runtime
        import subprocess
        binary = native_runtime.uv_binary()
        sources = native_runtime.source_root() / 'backend' / 'worker.py'
        if not sources.is_file():
            raise RuntimeError('Native Qwen worker files are missing')
        # Verify the exact eSpeak data/library paths the frozen Kokoro tokenizer
        # uses. Import-only smoke tests failed to catch a missing data directory.
        import ctypes
        import espeakng_loader
        data_path = Path(espeakng_loader.get_data_path())
        lib_path = Path(espeakng_loader.get_library_path())
        if not data_path.is_dir() or not lib_path.is_file():
            raise RuntimeError(f'Bundled Kokoro phonemizer is incomplete: {data_path}, {lib_path}')
        ctypes.CDLL(str(lib_path))
        print('Native Kokoro eSpeak data: ready', flush=True)
        subprocess.run([str(binary), '--version'], check=True, timeout=20)
        print('Native optional engine runtime: available', flush=True)
        return

    if "--native-install-engine" in sys.argv:
        from backend import native_runtime
        if len(sys.argv) < 3:
            raise SystemExit('Specify qwen-mlx or qwen-torch')
        engine = sys.argv[2]
        model = sys.argv[4] if len(sys.argv) >= 5 and sys.argv[3] == '--model' else None
        native_runtime.install(engine, model)
        return

    if "--native-engine-worker" in sys.argv:
        # Spawn the bundled executable as a separate ML model process instead
        # of requiring a system Python or another venv.
        os.environ["HUMPERDINCK_NATIVE_PACKAGE"] = "1"
        from backend import worker
        import json
        for line in sys.stdin:
            if line.strip():
                worker.run(json.loads(line))
        return

    parser = argparse.ArgumentParser(description="Bundled Humperdinck localhost service")
    parser.add_argument("--port", type=int, required=True)
    parser.add_argument("--data-dir", type=Path, required=True)
    args = parser.parse_args()
    if not 1 <= args.port <= 65535:
        parser.error("port must be between 1 and 65535")

    # Set these before importing backend.app (which initializes the data store).
    data_dir = args.data_dir.expanduser().resolve()
    data_dir.mkdir(parents=True, exist_ok=True)
    os.environ["HUMPERDINCK_DATA"] = str(data_dir)
    os.environ["HUMPERDINCK_NATIVE_PACKAGE"] = "1"
    install_builtin_voices(data_dir)
    install_builtin_sounds(data_dir)

    static = frontend_directory()
    if not (static / "index.html").is_file():
        parser.error("compiled frontend missing; run npm run build --prefix frontend")

    from backend import media_tools
    media_tools.configure()

    # PyInstaller --onefile (Mac, Linux) has a launcher process and a Python
    # child; on Windows (--onedir) the parent is the app itself. The native
    # app kills its child on Quit; without this watchdog,
    # the Python child can survive and keep serving browser tabs in the
    # background. This also handles unexpected app crashes.
    from threading import Thread
    import time
    launcher_pid = os.getppid()
    if sys.platform == 'win32':
        # Windows preserves a dead parent's PID. Keep a HANDLE to the
        # parent so we can tell when it exits instead.
        import ctypes
        kernel = ctypes.WinDLL('kernel32', use_last_error=True)
        kernel.OpenProcess.argtypes = [ctypes.c_ulong, ctypes.c_int, ctypes.c_ulong]
        kernel.OpenProcess.restype = ctypes.c_void_p
        kernel.WaitForSingleObject.argtypes = [ctypes.c_void_p, ctypes.c_ulong]
        kernel.WaitForSingleObject.restype = ctypes.c_ulong
        parent_handle = kernel.OpenProcess(0x00100000, False, launcher_pid)
    else:
        parent_handle = None

    def launcher_gone():
        if parent_handle:
            return kernel.WaitForSingleObject(parent_handle, 0) == 0
        return os.getppid() != launcher_pid

    def stop_if_launcher_exits():
        while True:
            time.sleep(1.0)
            if launcher_gone():
                try:
                    from backend import engines
                    engines.pool.shutdown()
                except Exception:
                    pass
                os._exit(0)
    Thread(target=stop_if_launcher_exits, daemon=True,
           name='native-launcher-watchdog').start()

    import uvicorn
    from fastapi.staticfiles import StaticFiles
    from backend.app import app

    # API routes are registered first. Mount static content last so /api works.
    app.mount("/", StaticFiles(directory=str(static), html=True), name="desktop-frontend")
    uvicorn.run(app, host="127.0.0.1", port=args.port, log_level="warning", access_log=False)


if __name__ == "__main__":
    main()
