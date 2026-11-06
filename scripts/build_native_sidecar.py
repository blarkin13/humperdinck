#!/usr/bin/env python3
"""Package the local FastAPI host for Tauri without requiring system Python."""
from __future__ import annotations

import argparse
import os
from pathlib import Path
import shutil
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[1]
TAURI_BIN = ROOT / "desktop" / "src-tauri" / "binaries"
TEMP = ROOT / "desktop" / ".build-sidecar"


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--target", required=True, help="Rust target triple from CI")
    args = parser.parse_args()

    target = args.target
    valid = {
        "x86_64-pc-windows-msvc",
        "aarch64-apple-darwin",
        "x86_64-apple-darwin",
        "x86_64-unknown-linux-gnu",
    }
    if target not in valid:
        parser.error(f"unsupported native target: {target}")

    frontend = ROOT / "frontend" / "dist"
    if not (frontend / "index.html").is_file():
        parser.error("build React first: npm run build --prefix frontend")

    TEMP.mkdir(parents=True, exist_ok=True)
    TAURI_BIN.mkdir(parents=True, exist_ok=True)
    cmd = [
        sys.executable, "-m", "PyInstaller",
        "--noconfirm", "--clean", "--onefile",
        "--name", "humperdinck-server",
        "--distpath", str(TEMP / "dist"),
        "--workpath", str(TEMP / "work"),
        "--specpath", str(TEMP),
        "--paths", str(ROOT),
        "--add-data", f"{frontend}{os.pathsep}frontend/dist",
        "--collect-submodules", "uvicorn",
        str(ROOT / "desktop" / "server.py"),
    ]
    subprocess.run(cmd, cwd=ROOT, check=True)
    extension = ".exe" if "windows" in target else ""
    source = TEMP / "dist" / ("humperdinck-server" + extension)
    dest = TAURI_BIN / ("humperdinck-server-" + target + extension)
    shutil.copy2(source, dest)
    print(f"Packaged Tauri sidecar: {dest}")


if __name__ == "__main__":
    main()
