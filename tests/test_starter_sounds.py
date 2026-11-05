"""Regression tests: retire bad procedural nature assets without deleting uploads."""
from pathlib import Path
from uuid import uuid5, NAMESPACE_URL

import soundfile as sf
import numpy as np

from backend.sound_effects import SoundEffects


def legacy_id(n):
    return uuid5(NAMESPACE_URL, 'humperdinck:original-nature-v1:'+str(n)).hex


def test_new_library_is_empty_without_synthetic_defaults(tmp_path:Path):
    library=SoundEffects(tmp_path)
    assert library.list()==[]
    assert library.cleanup_marker.exists()
    assert library.list()==[]


def test_old_pack_is_removed_safely_but_user_recordings_survive(tmp_path:Path):
    library=SoundEffects(tmp_path)
    custom='a'*32
    old1,old2=legacy_id(1),legacy_id(2)
    entries={
        custom:{'id':custom,'name':'User Recording','category':'Rain','origin':'imported','duration':1.0},
        old1:{'id':old1,'name':'Synthetic Rain','category':'Rain','origin':'starter','duration':8},
        old2:{'id':old2,'name':'Synthetic Thunder','category':'Weather','origin':'starter','duration':9},
    }
    library._write(entries)
    for id in (custom,old1,old2):
        sf.write(library.folder/(id+'.wav'),np.ones(2400,dtype='float32')*.1,24000)
    results=library.list()
    assert [v['id'] for v in results]==[custom]
    assert library.get_path(custom).exists()
    assert not (library.folder/(old1+'.wav')).exists()
    assert not (library.folder/(old2+'.wav')).exists()
    # The cleanup marker keeps deleted starters from being restored on restart.
    assert [v['id'] for v in SoundEffects(tmp_path).list()]==[custom]


def test_no_cleanup_of_unrelated_or_custom_files(tmp_path:Path):
    library=SoundEffects(tmp_path)
    id=legacy_id(3)
    library._write({id:{'id':id,'name':'Custom re-import','origin':'imported',
                        'category':'Nature','duration':1.0}})
    sf.write(library.folder/(id+'.wav'),np.ones(2400,dtype='float32')*.1,24000)
    assert library.list()[0]['id']==id
    assert (library.folder/(id+'.wav')).exists()
