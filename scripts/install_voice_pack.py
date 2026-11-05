#!/usr/bin/env python3
"""Optional first-install support for explicitly approved Built-In Humperdinck Voices.

The owner publishes a generated-sample-only ZIP. The source uploads remain local
and are never retrieved by this installer.
"""
from __future__ import annotations
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen
import os
import sys

ROOT=Path(__file__).resolve().parent.parent
sys.path.insert(0,str(ROOT))
ASSET="humperdinck-builtin-voices-v1.zip"
RELEASE_TAG="builtin-humperdinck-voices-v1"
URL=f"https://github.com/blarkin13/humperdinck/releases/download/{RELEASE_TAG}/{ASSET}"
MAX_BYTES=120*1024*1024
MARKER=".builtin-humperdinck-voices-v1-installed"


def find_pack():
    bundled=ROOT/"assets"/"voice-packs"/ASSET
    if bundled.is_file():return bundled.read_bytes()
    request=Request(URL,headers={"User-Agent":"Humperdinck-Installer/1.0"})
    try:
        with urlopen(request,timeout=60) as response:
            raw=response.read(MAX_BYTES+1)
    except HTTPError as exc:
        if exc.code==404:
            print("Built-In Humperdinck Voices pack has not been published yet; skipping.")
            return None
        raise
    return raw


def install_pack(data_dir=None,reader=None):
    from backend.starter_voice_packs import install
    data_dir=Path(data_dir or os.environ.get("HUMPERDINCK_DATA",ROOT/"data"))
    directory=data_dir/"voices"
    marker=directory/MARKER
    # Re-read the published pack during upgrades to discover any new voices.
    # The importer tracks individual IDs, so existing/deleted voices stay untouched.
    raw=reader() if reader else find_pack()
    if raw is None:return {"installed":0,"skipped":True}
    if len(raw)>MAX_BYTES:raise ValueError("Built-In Humperdinck Voices pack too large")
    result=install(data_dir,raw)
    marker.parent.mkdir(parents=True,exist_ok=True)
    temp=marker.with_suffix(".tmp")
    temp.write_text("Checked Built-In Humperdinck Voices v1 for additions\n")
    temp.replace(marker)
    return result


if __name__=="__main__":
    try:
        result=install_pack()
        print(f"Built-In Humperdinck Voices: {result['installed']} voices installed")
    except (ValueError,OSError,URLError) as exc:
        sys.exit(f"Could not install built-in voices: {exc}")
