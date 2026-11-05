"""Regression tests for the royalty-safe nature starter library."""
from pathlib import Path
from tempfile import TemporaryDirectory

import numpy as np
import soundfile as sf

from backend.sound_effects import SoundEffects
from backend.starter_sounds import STARTERS,RATE,synthesize


def test_exactly_thirty_distinct_nature_sounds():
    assert len(STARTERS)==30
    assert len({entry[0] for entry in STARTERS})==30
    assert len({entry[-1] for entry in STARTERS})==30
    assert all(entry[4]>=7 for entry in STARTERS)
    assert sum(entry[1] in ('Rain','Weather','Wind','Water','Forest','Birds','Insects','Wildlife','Nature')
               for entry in STARTERS)==30


def test_sample_generation_is_repeatable_and_audio_is_finite():
    first=synthesize('rain',1.0,1)
    second=synthesize('rain',1.0,1)
    assert len(first)==RATE
    assert first.dtype==np.float32
    assert np.array_equal(first,second)
    assert np.isfinite(first).all()
    assert 0<np.max(np.abs(first))<=1


def test_distinct_sounds_are_distinct():
    rain=synthesize('rain',1.0,11)
    wind=synthesize('wind',1.0,11)
    assert not np.array_equal(rain,wind)


def test_installation_is_once_and_preserves_user_deletions(tmp_path:Path):
    library=SoundEffects(tmp_path)
    first=library.list()
    assert len(first)==30
    assert all(row['origin']=='starter' for row in first)
    assert all(len(row['waveform'])==56 for row in first)
    assert all(0<=height<=1 for row in first for height in row['waveform'])
    assert library.starter_marker.exists()
    sample=first[0]
    saved=library.get_path(sample['id'])
    data,rate=sf.read(saved)
    assert rate==RATE
    assert len(data)==round(sample['duration']*RATE)
    assert np.isfinite(data).all()
    # A user may remove a starter; do not silently restore it on next launch.
    library.delete(sample['id'])
    reopened=SoundEffects(tmp_path)
    assert len(reopened.list())==29
    assert not saved.exists()


def test_favorite_is_persistent(tmp_path:Path):
    library=SoundEffects(tmp_path)
    sound=library.list()[0]
    library.update(sound['id'],None,None,True)
    assert SoundEffects(tmp_path).list()[0]['favorite'] is True
