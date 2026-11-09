"""Download Kokoro preset weights into the user's shared model cache."""
from __future__ import annotations

from pathlib import Path
import hashlib
import ssl
import certifi
import shutil
import urllib.request
import json
import time
from uuid import uuid4

from backend.catalog import preset_path

SOURCE = "https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.1/"
# Checksums are from the upstream model-files-v1.1 GitHub Release assets.
FILES = (("kokoro-v1.0.onnx", 50_000_000), ("voices-v1.0.bin", 1_000_000))
SHA256 = {
    "kokoro-v1.0.onnx": "beb0d1848dee9a49da392cc3df26958d46cfa35d321edf434f52949153f0df3a",
    "voices-v1.0.bin": "bca610b8308e8d99f32e6fe4197e7ec01679264efed0cac9140fe9c29f1fbf7d",
}


# Older release tags holding a byte-identical copy (verified against SHA256).
# GitHub's release host can 504 one tag while serving another.
MIRRORS = {
    "voices-v1.0.bin": "https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0/voices-v1.0.bin",
}


def _sources(name):
    """The release download link, then the same asset through the GitHub API.

    GitHub's release host sometimes returns 5xx for a while; the API is a
    separate path to the identical file (the SHA-256 is checked either way)."""
    yield SOURCE + name, {}
    if name in MIRRORS:
        yield MIRRORS[name], {}
    try:
        context = ssl.create_default_context(cafile=certifi.where())
        api = urllib.request.Request("https://api.github.com/repos/thewh1teagle/kokoro-onnx/releases/tags/model-files-v1.1",
                                     headers={"User-Agent": "Humperdinck-Desktop/0.1", "Accept": "application/vnd.github+json"})
        with urllib.request.urlopen(api, timeout=30, context=context) as response:
            assets = json.loads(response.read(4 * 1024 * 1024)).get("assets", [])
        asset = next((a for a in assets if a.get("name") == name), None)
        if asset:
            yield asset["url"], {"Accept": "application/octet-stream"}
    except (OSError, ValueError):
        return


def _download(url, headers, partial, progress=lambda _: None):
    request = urllib.request.Request(url, headers={"User-Agent": "Humperdinck-Desktop/0.1", **headers})
    # PyInstaller on macOS has no reliable system CA bundle path.
    # Supply a trusted CA store; do not disable TLS validation.
    context = ssl.create_default_context(cafile=certifi.where())
    name = next((asset for asset, _ in FILES if partial.name.startswith(asset + ".")), partial.name)
    # Bound a faulty upstream response before it can fill the user's disk.
    max_bytes = 512 * 1024 * 1024 if name.endswith(".onnx") else 64 * 1024 * 1024  # voices-v1.0.bin is ~27 MB
    with urllib.request.urlopen(request, timeout=120, context=context) as response, partial.open("wb") as output:
        raw_size = response.headers.get("Content-Length")
        expected = int(raw_size) if raw_size else 0
        if expected > max_bytes:
            raise RuntimeError(name + " download exceeds the expected model size")
        downloaded, next_percent, next_mb = 0, 10, 32
        while True:
            chunk = response.read(1024 * 1024)
            if not chunk:
                break
            downloaded += len(chunk)
            if downloaded > max_bytes:
                raise RuntimeError(name + " download exceeds the expected model size")
            output.write(chunk)
            if expected:
                percent = int(downloaded * 100 / expected)
                if percent >= next_percent:
                    progress(f"Downloading {name}: {min(100, percent)}%")
                    next_percent = (percent // 10 + 1) * 10
            elif downloaded >= next_mb * 1024 * 1024:
                progress(f"Downloading {name}: {downloaded // (1024 * 1024)} MB")
                next_mb += 32
        if expected and downloaded != expected:
            raise RuntimeError(partial.name + " download is incomplete")


def _sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as file:
        for chunk in iter(lambda: file.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _has_capacity(directory: Path, required: int) -> None:
    # Allow 20 percent temporary headroom to avoid filling the customer's disk.
    free = shutil.disk_usage(directory).free
    if free < int(required * 1.2):
        required_mb = (required * 1.2 + (1024 * 1024 - 1)) // (1024 * 1024)
        available_mb = free // (1024 * 1024)
        raise RuntimeError(
            f"Not enough free disk space to install the voice model "
            f"(need about {int(required_mb)} MB; {available_mb} MB available). "
            "Free up space in the model storage location and retry."
        )


def download_kokoro(progress=lambda _: None, attempts=4) -> Path:
    directory = preset_path("kokoro", "")
    directory.mkdir(parents=True, exist_ok=True)
    for name, minimum in FILES:
        path = directory / name
        if path.is_file() and path.stat().st_size >= minimum:
            if _sha256(path) == SHA256[name]:
                progress("Verified existing " + name)
                continue
            progress("Existing " + name + " is incomplete or corrupted; downloading a verified replacement")
        _has_capacity(directory, minimum)
        progress("Downloading " + name + " to shared model storage")
        partial = directory / (name + "." + uuid4().hex + ".partial")
        try:
            for attempt in range(attempts):
                try:
                    failure = RuntimeError(name + " has no available download source")
                    for url, headers in _sources(name):
                        try:
                            _download(url, headers, partial, progress)
                            # Validate *each* source before accepting it. A
                            # successful HTTP response can still be a truncated
                            # or corrupted model; try the fallback/mirror.
                            if partial.stat().st_size < minimum:
                                raise RuntimeError(name + " is smaller than expected")
                            if _sha256(partial) != SHA256[name]:
                                raise RuntimeError(name + " SHA-256 does not match the pinned upstream release")
                            break
                        except (OSError, RuntimeError) as exc:
                            failure = exc
                            partial.unlink(missing_ok=True)
                    else:
                        raise failure
                    break
                except (OSError, RuntimeError):
                    if attempt == attempts - 1:
                        raise
                    progress(f"Download of {name} failed; retrying")
                    time.sleep(min(30, 5 * 2 ** attempt))
            if partial.stat().st_size < minimum:
                raise RuntimeError(name + " is smaller than expected")
            if _sha256(partial) != SHA256[name]:
                raise RuntimeError(name + " SHA-256 does not match the pinned upstream release")
            # Atomic replacement also repairs a corrupt file of the correct size.
            partial.replace(path)
            progress("Downloaded " + name)
        finally:
            partial.unlink(missing_ok=True)
    return directory
