#!/usr/bin/env python3
"""Read-only acceptance of the existing public GitHub installer delivery channel.

No user credentials, Cloudflare writes, production release changes or large binary
downloads. Verifies deployed website feeds against the public release API.
"""
import argparse
import json
import urllib.request
from urllib.error import HTTPError, URLError

REPO = "blarkin13/humperdinck-downloads"
API = f"https://api.github.com/repos/{REPO}/releases/latest"
ORIGIN = "https://humperdinck.studio"
UA = "Humperdinck-Distribution-Acceptance/1.0"

def fetch_json(url, timeout=25):
    req = urllib.request.Request(url, headers={
        "User-Agent": UA, "Accept": "application/vnd.github+json" if "api.github.com" in url else "application/json",
        "Cache-Control": "no-cache"
    })
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        if resp.status != 200:
            raise ValueError(f"Unexpected HTTP {resp.status} for {url}")
        return json.load(resp)

def verify():
    release = fetch_json(API)
    tag = release.get("tag_name", "")
    if not tag.startswith("v") or release.get("draft") or release.get("prerelease"):
        raise AssertionError("Latest release is not stable/approved")
    version = tag[1:]
    assets = {a["name"]: a for a in release.get("assets", [])}
    site = fetch_json(ORIGIN + "/downloads.json?acceptance=1")
    expected = {
        "windows": f"humperdinck-windows-x64-{version}.exe",
        "macos": f"humperdinck-macos-arm64-{version}.dmg",
        "linux": f"humperdinck-linux-x64-{version}.deb"
    }
    verified = {}
    for platform, name in expected.items():
        a = assets.get(name)
        if not a or a.get("state") != "uploaded" or a.get("size", 0) < 2_000_000:
            raise AssertionError(f"Missing/empty published installer for {platform}")
        url = f"https://github.com/{REPO}/releases/download/{tag}/{name}"
        if a.get("browser_download_url") != url:
            raise AssertionError(f"Unexpected repository release URL for {platform}")
        if not str(a.get("digest", "")).startswith("sha256:") or len(a["digest"]) != 71:
            raise AssertionError(f"Missing GitHub content SHA256 digest for {platform}")
        feed = site.get(platform)
        if not isinstance(feed, dict) or feed.get("published") is not True:
            raise AssertionError(f"Website doesn't publish {platform} installer")
        if feed.get("version") != version or feed.get("url") != url:
            raise AssertionError(f"Website points {platform} at wrong release or URL")
        verified[platform] = {"version": version, "size": a["size"], "github_digest": a["digest"]}
    manifest_asset = assets.get("latest.json")
    if not manifest_asset or manifest_asset.get("state") != "uploaded":
        raise AssertionError("Published release lacks updater manifest")
    manifest = fetch_json(ORIGIN + "/updates/latest.json?acceptance=1")
    if manifest.get("version") != version or not isinstance(manifest.get("platforms"), dict):
        raise AssertionError("Website updater manifest version/platforms mismatch")
    for key in ("windows-x86_64", "darwin-aarch64"):
        p = manifest["platforms"].get(key)
        if not isinstance(p, dict) or not isinstance(p.get("signature"), str) or not p["signature"].strip():
            raise AssertionError(f"Missing signature in {key} updater manifest")
        if not str(p.get("url", "")).startswith(f"https://github.com/{REPO}/releases/download/{tag}/"):
            raise AssertionError(f"Unsafe update URL for {key}")
    return {"result": "PASS", "origin": ORIGIN, "tag": tag, "installers": verified,
            "updater_manifest": "present, signed URLs checked",
            "limits": "Verifies live feed/release metadata and GitHub SHA digests; does not install binaries, independently hash downloaded bytes, or perform rollback."}

if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--json", action="store_true")
    args = parser.parse_args()
    try:
        result = verify()
    except (AssertionError, ValueError, HTTPError, URLError, TimeoutError, KeyError) as error:
        result = {"result": "FAIL", "reason": str(error)}
        print(json.dumps(result, indent=2))
        raise SystemExit(1)
    print(json.dumps(result, indent=2))
