"""Discover optional bundled FFmpeg and ffprobe without depending on shell PATH.

The two executables are independent GPL/LGPL-licensed dependencies. The
distribution workflow must supply verified, redistribution-compliant builds.
"""
from __future__ import annotations

import os
from pathlib import Path
import shutil
import subprocess
import sys

TOOLS = ("ffmpeg", "ffprobe")


def candidate_directory() -> Path | None:
    custom = os.environ.get("HUMPERDINCK_MEDIA_TOOLS_DIR")
    if custom:
        return Path(custom).expanduser()
    if hasattr(sys, "_MEIPASS"):
        bundled = Path(sys._MEIPASS) / "media-tools"
        if bundled.is_dir():
            return bundled
    return None


def bundled_tools() -> Path | None:
    directory = candidate_directory()
    if directory is None:
        return None
    ext = ".exe" if os.name == "nt" else ""
    if all((directory / (name + ext)).is_file() for name in TOOLS):
        return directory.resolve()
    return None


def standard_folders() -> list[Path]:
    """Where Homebrew (Mac) and winget (Windows) put FFmpeg; a running app's PATH may not include them."""
    if sys.platform == "darwin":
        return [Path("/opt/homebrew/bin"), Path("/usr/local/bin")]
    if sys.platform == "win32" and os.environ.get("LOCALAPPDATA"):
        winget = Path(os.environ["LOCALAPPDATA"]) / "Microsoft" / "WinGet"
        return [winget / "Links", *sorted((winget / "Packages").glob("Gyan.FFmpeg*/*/bin"), reverse=True)]
    return []


def install_command() -> list[str] | None:
    """The command that installs FFmpeg on this computer, or None when it must be installed by hand."""
    if sys.platform == "win32":
        winget = shutil.which("winget") or str(Path(os.environ.get("LOCALAPPDATA", "")) / "Microsoft" / "WindowsApps" / "winget.exe")
        if Path(winget).is_file():
            return [winget, "install", "--id", "Gyan.FFmpeg", "--exact", "--silent",
                    "--accept-source-agreements", "--accept-package-agreements"]
    if sys.platform == "darwin":
        for brew in ("/opt/homebrew/bin/brew", "/usr/local/bin/brew"):
            if Path(brew).is_file():
                return [brew, "install", "ffmpeg"]
    return None


def configure() -> Path | None:
    """Find bundled FFmpeg or a normal installation hidden from GUI app PATH.

    On macOS, launching a DMG-installed app via Finder often omits Homebrew's
    /opt/homebrew/bin. Prefer an explicitly bundled licensed build, then only
    trusted standard installation locations (never arbitrary downloaded files).
    """
    directory = bundled_tools()
    if directory is None:
        ext = ".exe" if os.name == "nt" else ""
        for folder in standard_folders():
            if all((folder / (name + ext)).is_file() and os.access(folder / (name + ext), os.X_OK) for name in TOOLS):
                directory = folder
                break
    if directory is not None:
        current = os.environ.get("PATH", "")
        folders = current.split(os.pathsep) if current else []
        if str(directory) not in folders:
            os.environ["PATH"] = str(directory) + os.pathsep + current
    return directory


def video_encoder_args() -> list[str]:
    """Keep H.264 when available; work with an LGPL-only FFmpeg without x264."""
    tool = shutil.which("ffmpeg")
    if not tool:
        raise FileNotFoundError("FFmpeg is required to render video")
    try:
        result = subprocess.run([tool, "-hide_banner", "-encoders"], check=True,
                                capture_output=True, text=True, timeout=20)
        if "libx264" in result.stdout:
            return ["-c:v", "libx264", "-preset", "veryfast", "-crf", "23"]
    except (OSError, subprocess.CalledProcessError, subprocess.TimeoutExpired):
        pass
    return ["-c:v", "mpeg4", "-q:v", "4"]
