"""Installer integration: nine genuine audio entries without manual UI imports."""
from hashlib import sha256
from io import BytesIO
from pathlib import Path
from zipfile import ZipFile
import json
import shutil

import numpy as np
import pytest
import soundfile as sf

from backend.curated_sounds import BY_SLUG
from backend.sound_effects import SoundEffects
from scripts import install_sound_pack as installer

SLUGS=[
    "trickling-water","campfire","hilltop-wind","atlantic-ocean",
    "thunderstorm","rain-leaves","night-crickets","forest-birds","river-creek",
]


def sample_pack():
    out=BytesIO()
    manifest={"version":1,"sounds":[]}
    sound=BytesIO()
    sf.write(sound,np.zeros(2400,dtype=np.float32),24000,format="WAV")
    audio=sound.getvalue()
    with ZipFile(out,"w") as bundle:
        for index,slug in enumerate(SLUGS):
            filename=f"clip-{index}.wav"
            bundle.writestr(filename,audio)
            manifest["sounds"].append({"slug":slug,"file":filename,"sha256":sha256(audio).hexdigest()})
        bundle.writestr("humperdinck-sounds.json",json.dumps(manifest))
    return out.getvalue()


def test_wrong_pack_checksum_fails_without_marking_installed(tmp_path):
    with pytest.raises(ValueError,match="checksum"):
        installer.install_pack(tmp_path,read=lambda:b"not the approved pack")
    assert not (tmp_path/"sound_effects"/installer.INSTALLED_MARKER).exists()


def test_existing_marker_prevents_redownload_or_reinstall(tmp_path):
    folder=tmp_path/"sound_effects"
    folder.mkdir()
    (folder/installer.INSTALLED_MARKER).write_text("already installed")
    assert installer.install_pack(tmp_path,read=lambda:1/0)==0


@pytest.mark.skipif(not shutil.which("ffmpeg"),reason="FFmpeg needed for audio normalization")
def test_first_install_imports_all_nine_and_preserves_local_deletions(tmp_path,monkeypatch):
    sample=sample_pack()
    monkeypatch.setattr(installer,"PACK_SHA256",sha256(sample).hexdigest())
    count=installer.install_pack(tmp_path,read=lambda:sample)
    assert count==9
    library=SoundEffects(tmp_path)
    entries=library.list()
    assert len(entries)==9
    assert {e.get("curated_slug") for e in entries}==set(SLUGS)
    assert {e.get("license") for e in entries}=={"CC0 1.0"}
    library.delete(entries[0]["id"])
    assert installer.install_pack(tmp_path,read=lambda:1/0)==0
    assert len(library.list())==8


def test_release_and_hash_pinned():
    assert installer.RELEASE_TAG=="nature-sounds-v1"
    assert "releases/download/" in installer.PACK_URL
    assert len(installer.PACK_SHA256)==64
