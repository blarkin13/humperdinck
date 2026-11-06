"""Boundaries of the optional, vetted FFmpeg packaging path."""
import os
from pathlib import Path
import shutil
import subprocess
import sys

from backend import media_tools


def test_configure_adds_only_complete_ffmpeg_pair(tmp_path, monkeypatch):
    folder = tmp_path / "tools"
    folder.mkdir()
    monkeypatch.setenv("HUMPERDINCK_MEDIA_TOOLS_DIR", str(folder))
    before = os.environ.get("PATH", "")
    assert media_tools.configure() is None
    assert os.environ.get("PATH", "") == before
    ext = ".exe" if os.name == "nt" else ""
    (folder / ("ffmpeg" + ext)).write_text("fake")
    assert media_tools.configure() is None
    (folder / ("ffprobe" + ext)).write_text("fake")
    assert media_tools.configure() == folder
    assert os.environ["PATH"].split(os.pathsep)[0] == str(folder)


def test_source_can_fall_back_to_existing_ffmpeg(tmp_path, monkeypatch):
    monkeypatch.delenv("HUMPERDINCK_MEDIA_TOOLS_DIR", raising=False)
    assert media_tools.bundled_tools() is None


def test_video_encoder_requires_ffmpeg(monkeypatch):
    monkeypatch.setattr(shutil, "which", lambda name: None)
    try:
        media_tools.video_encoder_args()
    except FileNotFoundError:
        pass
    else:
        raise AssertionError("Expected a missing-FFmpeg error")


def test_video_encoder_falls_back_when_x264_missing(monkeypatch):
    monkeypatch.setattr(shutil, "which", lambda name: "ffmpeg")
    monkeypatch.setattr(subprocess, "run", lambda *args, **kwargs: type("R", (), {"stdout": "mpeg4 encoder"})())
    assert media_tools.video_encoder_args() == ["-c:v", "mpeg4", "-q:v", "4"]
