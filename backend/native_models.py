"""Download Kokoro preset weights into the user's shared model cache."""
from __future__ import annotations

from pathlib import Path
import shutil
import urllib.request
from uuid import uuid4

from backend.catalog import preset_path

SOURCE = "https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.1/"
FILES = (("kokoro-v1.0.onnx", 50_000_000), ("voices-v1.0.bin", 1_000_000))


def download_kokoro(progress=lambda _: None) -> Path:
    directory = preset_path("kokoro", "")
    directory.mkdir(parents=True, exist_ok=True)
    for name, minimum in FILES:
        path = directory / name
        if path.is_file() and path.stat().st_size >= minimum:
            continue
        progress("Downloading " + name + " to shared model storage")
        partial = directory / (name + "." + uuid4().hex + ".partial")
        try:
            request = urllib.request.Request(SOURCE + name, headers={"User-Agent": "Humperdinck-Desktop/0.1"})
            with urllib.request.urlopen(request, timeout=120) as response, partial.open("wb") as output:
                shutil.copyfileobj(response, output)
                length = response.headers.get("Content-Length")
                if length and partial.stat().st_size != int(length):
                    raise RuntimeError(name + " download is incomplete")
            if partial.stat().st_size < minimum:
                raise RuntimeError(name + " is smaller than expected")
            if not path.is_file() or path.stat().st_size < minimum:
                partial.replace(path)
            progress("Downloaded " + name)
        finally:
            partial.unlink(missing_ok=True)
    return directory
