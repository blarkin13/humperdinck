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


def _store(tmp_path:Path,level:float=.1):
    author=tmp_path/"creator"
    sample=author/f"sample{level}.wav"
    sample.parent.mkdir(parents=True,exist_ok=True)
    sf.write(str(sample),np.ones(24000,dtype=np.float32)*level,24000)
    return StarterVoices(author),sample


def test_newer_revision_removes_updates_and_keeps_personal_voices(tmp_path:Path):
    store,sample=_store(tmp_path)
    store.approve("1"*32,sample,{"name":"Keep"})
    store.approve("2"*32,sample,{"name":"Drop"})
    user=tmp_path/"user"
    assert install(user,store.export(["1"*32,"2"*32],revision=10))["installed"]==2
    voices=user/"voices"
    names=json.loads((voices/"names.json").read_text())
    names["personal"]={"name":"Mine"}
    (voices/"names.json").write_text(json.dumps(names))
    (voices/"personal.wav").write_bytes(b"mine")
    _,louder=_store(tmp_path,.3)
    store.approve("1"*32,louder,{"name":"Keep Renamed"})
    store.remove("2"*32)
    result=install(user,store.export(["1"*32],revision=11))
    assert result["removed"]==[stable_id("2"*32)] and result["updated"]==[stable_id("1"*32)]
    names=json.loads((voices/"names.json").read_text())
    assert set(names)=={stable_id("1"*32),"personal"} and names[stable_id("1"*32)]["name"]=="Keep Renamed"
    assert not (voices/(stable_id("2"*32)+".wav")).exists() and (voices/"personal.wav").exists()
    assert (voices/(stable_id("1"*32)+".wav")).read_bytes()==louder.read_bytes()


def test_bundled_pack_never_undoes_a_newer_revision(tmp_path:Path):
    store,sample=_store(tmp_path)
    store.approve("1"*32,sample,{"name":"One"})
    store.approve("2"*32,sample,{"name":"Two"})
    bundled=store.export(["1"*32,"2"*32])  # revision 0, like the copy inside the installer
    user=tmp_path/"user"
    install(user,bundled)
    install(user,store.export(["1"*32],revision=5))
    result=install(user,bundled)
    assert result["installed"]==0 and result["removed"]==[]
    assert not (user/"voices"/(stable_id("2"*32)+".wav")).exists()


def test_feed_check_downloads_only_when_revision_is_newer(tmp_path:Path):
    from backend import builtin_voice_updates
    store,sample=_store(tmp_path)
    store.approve("1"*32,sample,{"name":"One"})
    pack=store.export(["1"*32],revision=7)
    calls=[]
    def fetch(name,limit):
        calls.append(name)
        return json.dumps({"revision":7}).encode() if name=="latest.json" else pack
    user=tmp_path/"user"
    assert builtin_voice_updates.check(user,fetch)["installed"]==1
    assert builtin_voice_updates.check(user,fetch)["changed"] is False
    assert calls==["latest.json","pack.zip","latest.json"]


def test_remove_requires_voice_in_pack(tmp_path:Path):
    with pytest.raises(ValueError):
        StarterVoices(tmp_path).remove("9"*32)


def test_gallery_voices_download_update_and_stay_when_retired(tmp_path:Path):
    from backend import voice_catalog
    store,sample=_store(tmp_path)
    store.approve("1"*32,sample,{"name":"Gallery One","category":"Story"})
    store.set_channel("1"*32,"catalog")
    assert store.list()[0]["channel"]=="catalog"
    entries=[]
    def publish():
        entries[:]=list(store.catalog_files(["1"*32]))
    publish()
    def fetch(name,limit):
        if name=="catalog.json":
            return json.dumps({"revision":1,"voices":[e for e,_ in entries]}).encode()
        return next(raw for e,raw in entries if e["file"]==name)
    user=tmp_path/"user"
    uid=stable_id("1"*32)
    assert voice_catalog.listing(user,fetch)[0]["installed"] is False
    voice_catalog.download(user,uid,fetch)
    assert voice_catalog.listing(user,fetch)[0]["installed"] is True
    names=json.loads((user/"voices"/"names.json").read_text())
    assert names[uid]["origin"]=="humperdinck-catalog" and names[uid]["reference_text"]==SENTENCE
    _,louder=_store(tmp_path,.3)
    store.approve("1"*32,louder,{"name":"Gallery One"})
    assert store.list()[0]["channel"]=="catalog"  # re-approving keeps the channel
    publish()
    assert voice_catalog.refresh_installed(user,fetch)==[uid]
    assert (user/"voices"/(uid+".wav")).read_bytes()==louder.read_bytes()
    # A newer built-in pack never removes a voice the person chose from the gallery.
    store.approve("2"*32,sample,{"name":"Built"})
    install(user,store.export(["2"*32],revision=50))
    assert (user/"voices"/(uid+".wav")).exists()


def test_gallery_rejects_damaged_download(tmp_path:Path):
    from backend import voice_catalog
    store,sample=_store(tmp_path)
    store.approve("1"*32,sample,{"name":"One"})
    entry,_=next(store.catalog_files(["1"*32]))
    fetch=lambda name,limit:json.dumps({"voices":[entry]}).encode() if name=="catalog.json" else b"RIFFbroken"
    with pytest.raises(ValueError,match="damaged"):
        voice_catalog.download(tmp_path/"user",entry["voice_id"],fetch)


def test_set_details_renames_a_pack_voice_without_touching_the_sample(tmp_path):
    import json
    from backend.starter_voice_packs import StarterVoices
    bank = StarterVoices(tmp_path)
    bank.catalog.write_text(json.dumps({'v1': {'source_voice_id': 'v1', 'name': 'Old', 'category': 'A', 'channel': 'catalog'}}))
    (bank.folder / 'v1.wav').write_bytes(b'RIFF')
    entry = bank.set_details('v1', name='  New name ', category='Narrator')
    assert (entry['name'], entry['category'], entry['channel']) == ('New name', 'Narrator', 'catalog')
    assert (bank.folder / 'v1.wav').read_bytes() == b'RIFF'
    with pytest.raises(ValueError):
        bank.set_details('v1', name='   ')
    with pytest.raises(ValueError):
        bank.set_details('missing', name='x')
