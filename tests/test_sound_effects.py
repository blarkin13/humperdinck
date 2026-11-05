"""Sound library persistence and input validation."""
from pathlib import Path
import pytest
from backend.sound_effects import SoundEffects, MAX_BYTES


def test_library_initializes_empty(tmp_path: Path):
    library=SoundEffects(tmp_path)
    assert library.list()==[]


def test_rejects_invalid_format_and_oversized_inputs(tmp_path: Path):
    library=SoundEffects(tmp_path)
    with pytest.raises(ValueError,match='Unsupported'):
        library.add('danger.exe',b'data')
    with pytest.raises(ValueError,match='under 30 MB'):
        library.add('noise.wav',b'')
    with pytest.raises(ValueError,match='under 30 MB'):
        library.add('noise.wav',b'0'*(MAX_BYTES+1))


def test_prevents_unsafe_paths(tmp_path: Path):
    library=SoundEffects(tmp_path)
    for unsafe in ('../../abc','abc.wav','f'*33,''):
        with pytest.raises(ValueError):
            library.get_path(unsafe)


def test_catalog_roundtrip(tmp_path: Path):
    library=SoundEffects(tmp_path)
    effect_id='a'*32
    (library.folder/(effect_id+'.wav')).write_bytes(b'fake')
    library._write({effect_id:{
        'id':effect_id,'name':'Rain','category':'Weather',
        'duration':1.2,'created_at':'2026-11-05T00:00:00Z'
    }})
    assert SoundEffects(tmp_path).list()[0]['name']=='Rain'
    changed=library.update(effect_id,'Heavy rain','Atmosphere')
    assert changed['name']=='Heavy rain'
    assert changed['category']=='Atmosphere'
    assert library.delete(effect_id)=={'deleted':True}
    assert library.list()==[]
    assert not (library.folder/(effect_id+'.wav')).exists()
