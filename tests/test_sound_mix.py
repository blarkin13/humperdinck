"""Audio soundscape regression tests; no TTS models required."""
import numpy as np
import pytest

from backend.sound_mix import fade_clip, loop_to_duration, mix_ambience, assemble_narration


def test_fade_has_smooth_endpoints():
    clip=np.ones(100,dtype=np.float32)
    faded=fade_clip(clip,100,fade_in=.2,fade_out=.2)
    assert faded[0]==pytest.approx(0)
    assert faded[-1]==pytest.approx(0)
    assert faded[20]==pytest.approx(1)
    assert 0<faded[10]<1


def test_loop_trims_to_duration():
    assert np.array_equal(loop_to_duration([.1,.2,.3],8),
                          np.array([.1,.2,.3,.1,.2,.3,.1,.2],dtype=np.float32))


def test_ducking_only_during_speech():
    voice=np.zeros(300,dtype=np.float32)
    speech=np.zeros(300,dtype=bool)
    speech[100:200]=True
    result=mix_ambience(voice,np.ones(20,dtype=np.float32),speech,
                        sample_rate=100,volume=.5,ducking=.2,
                        fade_in=0,fade_out=0)
    assert result[10]==pytest.approx(.5)
    assert result[160]==pytest.approx(.1,abs=.01)
    assert result[280]==pytest.approx(.5,abs=.01)


def test_mix_fades_at_start_and_finish():
    out=mix_ambience(np.zeros(100,dtype=np.float32),
                     np.ones(5,dtype=np.float32),
                     np.zeros(100,dtype=bool),
                     sample_rate=100,volume=.5,ducking=.3,
                     fade_in=.2,fade_out=.2)
    assert out[0]==pytest.approx(0)
    assert out[50]==pytest.approx(.5)
    assert out[-1]==pytest.approx(0)


def test_effect_cues_are_sequential_and_looped_bed_is_overlay():
    sections=[
        ([np.ones(2,dtype=np.float32)*.2],
         np.ones(3,dtype=np.float32)*.4,
         [np.ones(2,dtype=np.float32)*.3],2),
        ([],np.ones(3,dtype=np.float32)*.5,[],0),
    ]
    dry=assemble_narration(sections)
    assert np.allclose(dry,[.2,.2,.4,.4,.4,.3,.3,0,0,.5,.5,.5])
    bed=assemble_narration(sections,np.ones(3,dtype=np.float32),
                           sample_rate=100,ambience_volume=.1,
                           ducking=.5,fade_in=0,fade_out=0)
    assert len(bed)==len(dry)
    assert bed[0]==pytest.approx(.3)
    assert .44<bed[4]<.5


def test_rejects_unaligned_speech_mask():
    with pytest.raises(ValueError):
        mix_ambience(np.zeros(5),np.ones(2),np.zeros(3,dtype=bool))
