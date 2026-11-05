#!/usr/bin/env python3
"""Install the verified, genuine CC0 nature audio pack for new installations.

Run from the platform-independent install.py after Python audio dependencies
and FFmpeg are available. Never rely on a user manually importing the pack.
"""
from __future__ import annotations

import hashlib
import os
import shutil
import sys
import tempfile
from pathlib import Path
from urllib.request import Request, urlopen

ROOT=Path(__file__).resolve().parent.parent
if str(ROOT) not in sys.path:
    sys.path.insert(0,str(ROOT))

ASSET_NAME="humperdinck-cc0-nature-pack.zip"
RELEASE_TAG="nature-sounds-v1"
PACK_URL=f"https://github.com/blarkin13/humperdinck/releases/download/{RELEASE_TAG}/{ASSET_NAME}"
PACK_SHA256="37c94fa9f2c27df851899d9ac8ed3c8076e0476ea313de838db590a6304c17a7"
MAX_PACK_BYTES=100*1024*1024
INSTALLED_MARKER=".cc0-nature-pack-v1-installed"


def read_pack():
    """Prefer the ZIP already shipped beside the app; otherwise fetch release asset."""
    bundled=ROOT/"assets"/"sound-packs"/ASSET_NAME
    if bundled.is_file():
        print(f"Installing bundled sound pack: {bundled}")
        return bundled.read_bytes()
    print(f"Downloading 9 CC0 nature recordings from {PACK_URL}")
    request=Request(PACK_URL,headers={"User-Agent":"Humperdinck-Installer/1.0"})
    with urlopen(request,timeout=90) as response:
        chunks=[]
        size=0
        while True:
            chunk=response.read(1024*1024)
            if not chunk:break
            size+=len(chunk)
            if size>MAX_PACK_BYTES:
                raise ValueError("Starter sound pack exceeds the size limit")
            chunks.append(chunk)
    return b"".join(chunks)


def install_pack(data_dir=None,read=None):
    """Return number of newly imported sounds; safe to rerun after partial failures."""
    from backend.sound_effects import SoundEffects

    if data_dir is None:
        data_dir=Path(os.environ.get("HUMPERDINCK_DATA",ROOT/"data"))
    data_dir=Path(data_dir)
    folder=data_dir/"sound_effects"
    marker=folder/INSTALLED_MARKER
    if marker.exists():
        print("Nature starter sound pack already installed.")
        return 0
    if not shutil.which("ffmpeg"):
        raise RuntimeError("FFmpeg is required to install the bundled recordings")
    raw=read() if read is not None else read_pack()
    if len(raw)>MAX_PACK_BYTES or hashlib.sha256(raw).hexdigest()!=PACK_SHA256:
        raise ValueError("Nature starter ZIP checksum does not match the approved originals")

    library=SoundEffects(data_dir)
    outcome=library.import_pack(raw)
    # Install only when the pack actually contains the expected nine titles.
    from backend.curated_sounds import BY_SLUG
    expected={
        "trickling-water","campfire","hilltop-wind","atlantic-ocean",
        "thunderstorm","rain-leaves","night-crickets","forest-birds","river-creek"
    }
    entries=library.list()
    installed={entry.get("curated_slug") for entry in entries}
    if not expected.issubset(installed):
        missing=", ".join(sorted(expected-installed))
        raise RuntimeError("Starter audio pack is incomplete: "+missing)

    folder.mkdir(parents=True,exist_ok=True)
    temporary=marker.with_suffix(".tmp")
    temporary.write_text(PACK_SHA256+"\n",encoding="utf-8")
    temporary.replace(marker)
    print(f"Nature sound pack ready: 9 genuine CC0 recordings ({outcome['count']} new).")
    return outcome["count"]


if __name__=="__main__":
    try:
        install_pack()
    except Exception as exc:
        sys.exit("Could not install the required nature sound pack: "+str(exc)+
                 "\nPublish the verified ZIP as the "+RELEASE_TAG+
                 " GitHub Release asset and retry the installer.")
