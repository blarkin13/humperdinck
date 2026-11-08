#!/usr/bin/env python3
"""Pre-stage Tauri's NSIS toolchain on Windows CI, with resilient downloads.

`tauri build --bundles nsis` downloads NSIS and nsis_tauri_utils.dll from
GitHub releases with a single attempt, so a brief 5xx fails packaging. This
stages the same files, verified against the SHA-1 values Tauri pins
(tauri-bundler, @tauri-apps/cli 2.x), where Tauri looks for them:
%LOCALAPPDATA%\\tauri\\NSIS. Tauri then finds them and skips its download.
"""
from __future__ import annotations

import hashlib
from io import BytesIO
import os
from pathlib import Path
import shutil
import sys
from zipfile import ZipFile

sys.path.insert(0, str(Path(__file__).resolve().parent))
from release_download import fetch  # noqa: E402

NSIS_URL = "https://github.com/tauri-apps/binary-releases/releases/download/nsis-3.13/nsis-3.13.zip"
NSIS_SHA1 = "DB14F8AF2EA346B786C6AE19343F61AAF5E09B8E"
NSIS_EXE_SHA1 = "6D45D4E8CCF18FE1FDAC9164058F356102A2ECF2"
UTILS_URL = "https://github.com/tauri-apps/nsis-tauri-utils/releases/download/nsis_tauri_utils-v0.5.3/nsis_tauri_utils.dll"
UTILS_SHA1 = "75197FEE3C6A814FE035788D1C34EAD39349B860"


def sha1(data: bytes) -> str:
    return hashlib.sha1(data).hexdigest().upper()


def main() -> None:
    tools = Path(os.environ.get("LOCALAPPDATA") or Path.home() / "AppData" / "Local") / "tauri"
    nsis = tools / "NSIS"
    utils = nsis / "Plugins" / "x86-unicode" / "additional" / "nsis_tauri_utils.dll"
    exe = nsis / "NSIS.exe"
    if exe.is_file() and sha1(exe.read_bytes()) == NSIS_EXE_SHA1 and utils.is_file() and sha1(utils.read_bytes()) == UTILS_SHA1:
        print(f"Tauri NSIS toolchain already staged: {nsis}")
        return
    archive = fetch(NSIS_URL, 64 * 1024 * 1024)
    if sha1(archive) != NSIS_SHA1:
        raise RuntimeError("NSIS archive SHA-1 does not match Tauri's pinned value")
    dll = fetch(UTILS_URL, 16 * 1024 * 1024)
    if sha1(dll) != UTILS_SHA1:
        raise RuntimeError("nsis_tauri_utils.dll SHA-1 does not match Tauri's pinned value")
    tools.mkdir(parents=True, exist_ok=True)
    shutil.rmtree(nsis, ignore_errors=True)
    shutil.rmtree(tools / "nsis-3.13", ignore_errors=True)
    with ZipFile(BytesIO(archive)) as zipped:
        zipped.extractall(tools)
    (tools / "nsis-3.13").rename(nsis)
    utils.parent.mkdir(parents=True, exist_ok=True)
    utils.write_bytes(dll)
    if sha1(exe.read_bytes()) != NSIS_EXE_SHA1:
        raise RuntimeError("Staged NSIS.exe does not match Tauri's pinned value")
    print(f"Staged Tauri NSIS toolchain: {nsis}")


if __name__ == "__main__":
    main()
