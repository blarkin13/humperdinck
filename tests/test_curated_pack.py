"""Bulk import merges original CC0 recordings into the normal sound library."""
from hashlib import sha256
from io import BytesIO
from zipfile import ZipFile, ZIP_STORED
import json

import numpy as np
import pytest
import soundfile as sf

from backend.curated_sounds import BY_SLUG
from backend.sound_effects import SoundEffects


def make_pack(*,slug='trickling-water',filename='Swale.ogg',bad_checksum=False):
    wav=BytesIO()
    sf.write(wav,np.zeros(24000,dtype=np.float32),24000,format='WAV')
    audio=wav.getvalue()
    manifest={'version':1,'sounds':[{
        'slug':slug,'file':filename,
        'sha256':('f'*64 if bad_checksum else sha256(audio).hexdigest())
    }]}
    out=BytesIO()
    with ZipFile(out,'w',compression=ZIP_STORED) as z:
        z.writestr('humperdinck-sounds.json',json.dumps(manifest))
        z.writestr(filename,audio)
    return out.getvalue()


def test_bulk_import_has_no_separate_catalog(tmp_path):
    library=SoundEffects(tmp_path)
    result=library.import_pack(make_pack())
    assert result['count']==1
    assert len(library.list())==1
    audio=library.list()[0]
    assert audio['name']==BY_SLUG['trickling-water']['name']
    assert audio['creator']==BY_SLUG['trickling-water']['creator']
    assert audio['source_url']==BY_SLUG['trickling-water']['source_url']
    assert audio['license']=='CC0 1.0'
    again=library.import_pack(make_pack())
    assert again['count']==0
    assert again['skipped']==[audio['name']]
    assert len(library.list())==1


def test_reject_bad_checksums_and_unsafe_names(tmp_path):
    library=SoundEffects(tmp_path)
    with pytest.raises(ValueError,match='checksum'):
        library.import_pack(make_pack(bad_checksum=True))
    with pytest.raises(ValueError,match='Unsafe'):
        library.import_pack(make_pack(filename='../Swale.ogg'))
    assert library.list()==[]


def test_preserve_existing_imports(tmp_path):
    library=SoundEffects(tmp_path)
    data=BytesIO()
    sf.write(data,np.zeros(24000,dtype=np.float32),24000,format='WAV')
    existing=library.add('my-field-recording.wav',data.getvalue())
    library.import_pack(make_pack())
    assert len(library.list())==2
    assert library.get_path(existing['id']).is_file()
