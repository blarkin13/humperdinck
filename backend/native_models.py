"""Download Kokoro preset weights into the user's shared model cache."""
from __future__ import annotations

from pathlib import Path
import hashlib
import shutil
import urllib.request
from uuid import uuid4

from backend.catalog import preset_path

SOURCE = "https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.1/"
# Checksums are from the upstream model-files-v1.1 GitHub Release assets.
FILES = (("kokoro-v1.0.onnx", 50_000_000), ("voices-v1.0.bin", 1_000_000))
SHA256 = {
    "kokoro-v1.0.onnx": "beb0d1848dee9a49da392cc3df26958d46cfa35d321edf434f52949153f0df3a",
    "voices-v1.0.bin": "bca610b8308e8d99f32e6fe4197e7ec01679264efed0cac9140fe9c29f1fbf7d",
}


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
            digest = hashlib.sha256()
            with partial.open("rb") as model_file:
                for chunk in iter(lambda: model_file.read(1024 * 1024), b""):
                    digest.update(chunk)
            if digest.hexdigest() != SHA256[name]:
                raise RuntimeError(name + " SHA-256 does not match the pinned upstream release")
            if not path.is_file() or path.stat().st_size < minimum:
                partial.replace(path)
            progress("Downloaded " + name)
        finally:
            partial.unlink(missing_ok=True)
    return directory
