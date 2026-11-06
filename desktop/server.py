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
    base = Path(getattr(sys, "_MEIPASS", Path(__file__).resolve().parents[1]))
    archive = base / "voice-packs" / "humperdinck-builtin-voices-v1.zip"
    if not archive.is_file():
        raise RuntimeError("Built-In Humperdinck Voices are missing from the native app bundle")
    from backend.starter_voice_packs import install
    result = install(data_dir, archive.read_bytes())
    print(f"Built-In Humperdinck Voices: {result['total_in_pack']} included, "
          f"{result['installed']} newly imported", flush=True)
    return result


def main() -> None:
    if "--native-runtime-check" in sys.argv:
        from backend import native_runtime
        import subprocess
        binary = native_runtime.uv_binary()
        sources = native_runtime.source_root() / 'backend' / 'worker.py'
        if not sources.is_file():
            raise RuntimeError('Native Qwen/Piper worker files are missing')
        subprocess.run([str(binary), '--version'], check=True, timeout=20)
        print('Native optional engine runtime: available', flush=True)
        return

    if "--native-install-engine" in sys.argv:
        from backend import native_runtime
        if len(sys.argv) < 3:
            raise SystemExit('Specify qwen-mlx or piper')
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

    static = frontend_directory()
    if not (static / "index.html").is_file():
        parser.error("compiled frontend missing; run npm run build --prefix frontend")

    from backend import media_tools
    media_tools.configure()

    import uvicorn
    from fastapi.staticfiles import StaticFiles
    from backend.app import app

    # API routes are registered first. Mount static content last so /api works.
    app.mount("/", StaticFiles(directory=str(static), html=True), name="desktop-frontend")
    uvicorn.run(app, host="127.0.0.1", port=args.port, log_level="warning", access_log=False)


if __name__ == "__main__":
    main()
