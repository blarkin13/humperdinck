#!/usr/bin/env python3
"""Package the local FastAPI host for Tauri without requiring system Python."""
from __future__ import annotations

import argparse
import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import sysconfig

ROOT = Path(__file__).resolve().parents[1]
TAURI_BIN = ROOT / "desktop" / "src-tauri" / "binaries"
TEMP = ROOT / "desktop" / ".build-sidecar"


def checked_ffmpeg_files(directory: Path | None) -> list[tuple[str, Path]]:
    """Only bundle explicitly supplied LGPL-compatible tools with traceable source."""
    if directory is None:
        return []
    directory = directory.resolve()
    if not directory.is_dir():
        raise RuntimeError(f"FFmpeg bundle directory does not exist: {directory}")
    ext = ".exe" if sys.platform == "win32" else ""
    binaries = {name: directory / (name + ext) for name in ("ffmpeg", "ffprobe")}
    manifest_path = directory / "ffmpeg-bundle.json"
    license_path = directory / "COPYING.LGPLv2.1"
    for file in [*binaries.values(), manifest_path, license_path]:
        if not file.is_file():
            raise RuntimeError(f"FFmpeg bundle is missing {file.name}")
    meta = json.loads(manifest_path.read_text(encoding="utf-8"))
    if meta.get("license") not in ("LGPL-2.1-or-later", "LGPL-3.0-or-later"):
        raise RuntimeError("Only reviewed LGPL FFmpeg builds can be bundled")
    if not meta.get("source_url") or not meta.get("build_configuration"):
        raise RuntimeError("FFmpeg build manifest needs exact corresponding source and configuration")
    expected = meta.get("sha256", {})
    for name, file in binaries.items():
        digest = hashlib.sha256(file.read_bytes()).hexdigest()
        if expected.get(name) != digest:
            raise RuntimeError(f"{name} SHA-256 does not match the FFmpeg manifest")
    buildconf = subprocess.run([str(binaries["ffmpeg"]), "-hide_banner", "-buildconf"],
                               capture_output=True, text=True, check=True, timeout=30)
    configured = buildconf.stdout + buildconf.stderr
    if "--enable-gpl" in configured or "--enable-nonfree" in configured:
        raise RuntimeError("GPL or nonfree FFmpeg builds are not permitted in the unsigned native installer")
    if meta["build_configuration"].strip() not in configured:
        raise RuntimeError("FFmpeg runtime configuration differs from the manifest")
    subprocess.run([str(binaries["ffprobe"]), "-version"], check=True,
                   capture_output=True, timeout=30)
    return [(name + ext, file) for name, file in binaries.items()] + [
        ("ffmpeg-bundle.json", manifest_path), ("COPYING.LGPLv2.1", license_path)
    ]


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--target", required=True, help="Rust target triple from CI")
    parser.add_argument("--builtin-voices-pack", type=Path, default=ROOT / "assets" / "voice-packs" / "humperdinck-builtin-voices-v1.zip",
                        help="Pre-verified seven-voice pack from scripts/prepare_native_voice_pack.py")
    parser.add_argument("--ffmpeg-dir", type=Path, default=Path(os.environ["HUMPERDINCK_FFMPEG_BUNDLE_DIR"]) if os.environ.get("HUMPERDINCK_FFMPEG_BUNDLE_DIR") else None,
                        help="Verified LGPL FFmpeg tools + source manifest (optional until distribution approval)")
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

    if not args.builtin_voices_pack.is_file():
        parser.error("Built-In Humperdinck Voices are required: run python scripts/prepare_native_voice_pack.py")
    from prepare_native_voice_pack import validate as validate_builtin_voices
    builtin_count = validate_builtin_voices(args.builtin_voices_pack.read_bytes())
    print(f"Bundling {builtin_count} approved Built-In Humperdinck Voices")

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
        "--add-data", f"{args.builtin_voices_pack.resolve()}{os.pathsep}voice-packs",
        "--collect-submodules", "uvicorn",
        str(ROOT / "desktop" / "server.py"),
    ]
    ffmpeg = checked_ffmpeg_files(args.ffmpeg_dir)
    for name, binary_path in ffmpeg:
        switch = "--add-binary" if name.startswith(("ffmpeg", "ffprobe")) and name.endswith((".exe",)) or name in ("ffmpeg", "ffprobe") else "--add-data"
        cmd += [switch, f"{binary_path}{os.pathsep}media-tools"]
    if ffmpeg:
        print("Bundling license-reviewed FFmpeg + ffprobe into the sidecar")
    else:
        print("FFmpeg not bundled: package remains a preview without video/MP3 conversion")
    # Native Qwen MLX and Piper use opt-in isolated Python/uv runtimes in
    # writable user data, not ML libraries inside the replaceable app binary.
    uv_name = "uv.exe" if os.name == "nt" else "uv"
    uv_binary = Path(sysconfig.get_path("scripts")) / uv_name
    if not uv_binary.is_file():
        parser.error(f"Install uv before packaging: missing {uv_binary}")
    cmd += ["--add-binary", f"{uv_binary}{os.pathsep}runtime-tools",
            "--add-data", f"{ROOT / 'backend'}{os.pathsep}runtime-src/backend"]
    # Includes the CPU runtime, not the large voice model weights.
    cmd += ["--collect-all", "certifi",
            "--collect-all", "espeakng_loader",
            "--collect-all", "misaki",
            "--collect-all", "kokoro_onnx",
            "--collect-submodules", "backend",
            "--collect-all", "onnxruntime"]
    subprocess.run(cmd, cwd=ROOT, check=True)
    extension = ".exe" if "windows" in target else ""
    source = TEMP / "dist" / ("humperdinck-server" + extension)
    dest = TAURI_BIN / ("humperdinck-server-" + target + extension)
    shutil.copy2(source, dest)
    print(f"Packaged Tauri sidecar: {dest}")


if __name__ == "__main__":
    main()
