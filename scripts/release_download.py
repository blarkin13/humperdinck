"""Download a pinned GitHub release asset for native builds, resiliently.

GitHub's release-download host sometimes answers 5xx for a while. A build
should not fail on that alone, so this retries with backoff and then falls
back to the GitHub REST API's asset endpoint (a different path, authenticated
with GITHUB_TOKEN in CI). Callers still verify the SHA-256 of what comes back.
"""
from __future__ import annotations

import json
import os
import re
import ssl
import time
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

import certifi

AGENT = "Humperdinck-NativeBuilder/1.0"
RELEASE_URL = re.compile(r"^https://github\.com/([^/]+)/([^/]+)/releases/download/([^/]+)/([^/]+)$")


def _open(url: str, limit: int, timeout: int, headers: dict | None = None) -> bytes:
    context = ssl.create_default_context(cafile=certifi.where())
    request = Request(url, headers={"User-Agent": AGENT, **(headers or {})})
    with urlopen(request, timeout=timeout, context=context) as response:
        raw = response.read(limit + 1)
    if len(raw) > limit:
        raise RuntimeError(f"Download larger than expected: {url}")
    return raw


def _api_download(url: str, limit: int, timeout: int) -> bytes:
    owner, repo, tag, name = RELEASE_URL.match(url).groups()
    auth = {"Authorization": f"Bearer {os.environ['GITHUB_TOKEN']}"} if os.environ.get("GITHUB_TOKEN") else {}
    api = {"Accept": "application/vnd.github+json", **auth}
    release = json.loads(_open(f"https://api.github.com/repos/{owner}/{repo}/releases/tags/{tag}", 4 * 1024 * 1024, timeout, api))
    asset = next((a for a in release.get("assets", []) if a.get("name") == name), None)
    if not asset:
        raise RuntimeError(f"Release {tag} has no asset {name}")
    return _open(asset["url"], limit, timeout, {"Accept": "application/octet-stream", **auth})


def fetch(url: str, limit: int, timeout: int = 120, attempts: int = 5) -> bytes:
    errors = []
    for attempt in range(1, attempts + 1):
        for label, method in (("release", _open), ("api", _api_download)):
            if label == "api" and not RELEASE_URL.match(url):
                continue
            try:
                return method(url, limit, timeout)
            except (HTTPError, URLError, TimeoutError, ConnectionError, OSError) as exc:
                errors.append(f"{label} attempt {attempt}: {exc}")
                print(f"Download failed ({label}, attempt {attempt}/{attempts}): {exc}", flush=True)
        if attempt < attempts:
            time.sleep(min(60, 5 * 2 ** (attempt - 1)))
    raise RuntimeError("Could not download " + url + "\n" + "\n".join(errors))
