"""Curated CC0 collection regression and provenance tests."""
from backend.curated_sounds import SOUNDS,BY_SLUG,public_catalog
from backend.sound_effects import SoundEffects,MAX_EFFECT_SECONDS,MAX_BYTES

def test_ten_cc0_sources_are_unique_and_https():
    assert len(SOUNDS)==10
    assert len(BY_SLUG)==10
    assert len({s['source_url'] for s in SOUNDS})==10
    assert all(s['source_url'].startswith('https://') for s in SOUNDS)
    assert all(s['creator'] and s['name'] for s in SOUNDS)
    assert all(s['duration']<=MAX_EFFECT_SECONDS for s in SOUNDS)
    assert MAX_BYTES>=35*1024*1024

def test_only_commons_is_direct_install_and_has_verified_checksum():
    directly=[s for s in SOUNDS if 'download_url' in s]
    assert len(directly)==1
    assert directly[0]['slug']=='trickling-water'
    assert directly[0]['sha1']=='4f97748c715d90fda6357073f14a12e68f294d73'

def test_source_catalog_lists_install_status():
    result=public_catalog([{'id':'a'*32,'curated_slug':'forest-birds'}])
    assert len(result)==10
    forest=next(s for s in result if s['slug']=='forest-birds')
    assert forest['installed'] is True
    assert forest['installed_id']=='a'*32
    assert forest['download_method']=='login_then_import'
    assert next(s for s in result if s['slug']=='trickling-water')['download_method']=='direct'

def test_user_imports_untouched_and_curated_tracks_have_provenance(tmp_path):
    import numpy as np
    import soundfile as sf
    from pathlib import Path
    library=SoundEffects(tmp_path)
    wav=tmp_path/'test.wav'
    sf.write(wav,np.zeros(24000,dtype='float32'),24000)
    original=library.add('my-recording.wav',wav.read_bytes())
    source=BY_SLUG['forest-birds']
    imported=library.import_curated(source,wav.read_bytes(),'forest_birds.wav')
    assert imported['name']==source['name']
    assert imported['creator']==source['creator']
    assert imported['license']=='CC0 1.0'
    assert imported['origin']=='curated-cc0'
    assert len(library.list())==2
    assert library.get_path(original['id']).exists()
    again=library.import_curated(source,wav.read_bytes(),'forest_birds.wav')
    assert again['id']==imported['id']
    assert len(library.list())==2
