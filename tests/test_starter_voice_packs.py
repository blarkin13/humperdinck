"""Approved Built-In Humperdinck Voices contain only generated lighthouse audio."""
from io import BytesIO
from pathlib import Path
from zipfile import ZipFile
import json

import numpy as np
import pytest
import soundfile as sf

from backend.starter_voice_packs import StarterVoices,SENTENCE,stable_id,install
from scripts import install_voice_pack


def test_standard_sentence():
    assert SENTENCE=="The old lighthouse stood quietly above the waves, waiting for the next storm."


def test_export_never_includes_original_recording(tmp_path:Path):
    data=tmp_path/"owner"
    voice_id="a"*32
    recordings=data/"voices"
    recordings.mkdir(parents=True)
    original=recordings/(voice_id+".wav")
    sf.write(str(original),np.zeros(24000,dtype=np.float32),24000)
    generator_sample=data/"outputs"/"approved.wav"
    generator_sample.parent.mkdir()
    sf.write(str(generator_sample),np.ones(24000,dtype=np.float32)*.1,24000)
    bank=StarterVoices(data)
    bank.approve(voice_id,generator_sample,{"name":"Lighthouse","category":"Narration",
        "refinement":{"sliders":{"pitch":42,"pace":55,"rasp":60,"warmth":50}}})
    raw=bank.export([voice_id])
    with ZipFile(BytesIO(raw)) as bundle:
        assert sorted(bundle.namelist())==["manifest.json","samples/"+stable_id(voice_id)+".wav"]
        manifest=json.loads(bundle.read("manifest.json"))
        assert manifest["reference_text"]==SENTENCE
        assert manifest["voices"][0]["name"]=="Lighthouse"
        assert original.read_bytes()!=bundle.read("samples/"+stable_id(voice_id)+".wav")


def test_pack_installs_for_recipient_as_normal_voice_with_transcript(tmp_path:Path):
    original=tmp_path/"author"
    sample=original/"generated.wav"
    sample.parent.mkdir(parents=True)
    sf.write(str(sample),np.ones(24000,dtype=np.float32)*.12,24000)
    exporter=StarterVoices(original)
    exporter.approve("b"*32,sample,{"name":"Storm Watcher","category":"Storytelling",
        "refinement":{"description":"warm"}})
    raw=exporter.export(["b"*32])
    recipient=tmp_path/"recipient"
    result=install(recipient,raw)
    assert result["installed"]==1
    key=stable_id("b"*32)
    assert (recipient/"voices"/(key+".wav")).is_file()
    names=json.loads((recipient/"voices"/"names.json").read_text())
    assert names[key]["origin"]=="builtin-humperdinck"
    assert names[key]["reference_text"]==SENTENCE
    assert names[key]["name"]=="Storm Watcher"
    assert install(recipient,raw)["installed"]==0


def test_only_approved_samples_can_be_exported(tmp_path:Path):
    with pytest.raises(ValueError,match="approved"):
        StarterVoices(tmp_path).export(["0"*32])


def test_installer_recovers_if_no_pack_is_published(tmp_path:Path):
    assert install_voice_pack.install_pack(tmp_path,reader=lambda:None)["skipped"] is True


def test_installer_marks_complete_and_does_not_restore_deleted_voice(tmp_path:Path):
    data=tmp_path/"seed"
    sample=data/"voice.wav"
    sample.parent.mkdir()
    sf.write(str(sample),np.ones(24000,dtype=np.float32)*.2,24000)
    creator=StarterVoices(data)
    creator.approve("c"*32,sample,{"name":"One","category":"Demo"})
    pack=creator.export(["c"*32])
    target=tmp_path/"target"
    assert install_voice_pack.install_pack(target,reader=lambda:pack)["installed"]==1
    voice=target/"voices"/(stable_id("c"*32)+".wav")
    voice.unlink()
    assert install_voice_pack.install_pack(target,reader=lambda:pack)["installed"]==0
    assert not voice.exists()


def test_expanded_pack_adds_only_new_voices(tmp_path:Path):
    author=tmp_path/"creator"
    sample=author/"sample.wav"
    sample.parent.mkdir(parents=True)
    sf.write(str(sample),np.ones(24000,dtype=np.float32)*.08,24000)
    store=StarterVoices(author)
    store.approve("1"*32,sample,{"name":"Voice One"})
    first=store.export(["1"*32])
    recipient=tmp_path/"install"
    assert install_voice_pack.install_pack(recipient,reader=lambda:first)["installed"]==1
    original=recipient/"voices"/(stable_id("1"*32)+".wav")
    # The user decides to delete voice one after installation.
    original.unlink()
    store.approve("2"*32,sample,{"name":"Voice Two"})
    second=store.export(["1"*32,"2"*32])
    result=install_voice_pack.install_pack(recipient,reader=lambda:second)
    assert result["installed"]==1
    assert result["total_in_pack"]==2
    assert not original.exists()
    assert (recipient/"voices"/(stable_id("2"*32)+".wav")).exists()
    assert install_voice_pack.install_pack(recipient,reader=lambda:second)["installed"]==0
