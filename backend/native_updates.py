"""Discover public Humperdinck desktop installers without querying private GitHub.

Unsigned preview builds offer a manual download only. Automatic binary update
installation is exclusively handled by the signature-verifying Tauri updater.
"""
import json
import os
import re
import ssl
import sys
from urllib.request import Request, urlopen
from urllib.parse import urlparse
import certifi

MANIFEST = "https://humperdinck.larki-brian.workers.dev/downloads.json"
BASE = "https://humperdinck.larki-brian.workers.dev"
VERSION = os.environ.get("HUMPERDINCK_NATIVE_VERSION", "0.1.0")
PLATFORMS = {"darwin": ("macos", ".dmg"), "win32": ("windows", ".exe"), "linux": ("linux", ".deb")}


def version(value):
    match = re.fullmatch(r"v?(\d+)\.(\d+)\.(\d+)", str(value))
    return tuple(map(int, match.groups())) if match else (0, 0, 0)


def check():
    platform, suffix = PLATFORMS.get(sys.platform, (None, None))
    if not platform:
        return {"available": False, "reason": "Unsupported operating system",
                "can_install": False, "can_download": False}
    request = Request(MANIFEST, headers={"User-Agent": "Humperdinck-NativeUpdater/2.0",
                                         "Accept": "application/json", "Cache-Control": "no-cache"})
    with urlopen(request, timeout=9, context=ssl.create_default_context(cafile=certifi.where())) as response:
        manifest = json.load(response)
    entry = manifest.get(platform, {}) if isinstance(manifest, dict) else {}
    name = entry.get("url", "")
    parsed = urlparse(name)
    valid_url = (parsed.scheme == "" and parsed.netloc == "" and parsed.path.startswith("/downloads/")
                 and parsed.path.endswith(suffix) and not parsed.query and not parsed.fragment
                 and re.fullmatch(r"/downloads/[A-Za-z0-9][A-Za-z0-9._-]{1,180}\.(exe|dmg|deb)", parsed.path))
    newest = str(entry.get("version", ""))
    if entry.get("published") is True and valid_url and version(newest) > version(VERSION):
        return {"available": True, "latest": newest, "current_version": VERSION,
                "summary": "Humperdinck desktop update", "url": BASE + "/#download",
                "download_url": BASE + name, "download_name": parsed.path.split("/")[-1],
                "changed_files": [], "removed_files": [], "can_install": False,
                "can_download": True}
    return {"available": False, "reason": "No newer desktop installer published on Humperdinck",
            "changed_files": [], "removed_files": [], "can_install": False,
            "can_download": False, "current_version": VERSION}
