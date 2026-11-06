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


def main() -> None:
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
