"""Uploaded voice refinements: validation and non-destructive filter design."""
import pytest
from backend.voice_refinement import DEFAULTS, normalize_refinement, filter_chain, suggest_sliders


def test_neutral_sliders_do_not_modify_audio():
    assert filter_chain({'sliders':DEFAULTS,'description':''})==''


def test_pitch_and_speed_use_time_correction():
    filters=filter_chain({'sliders':{'pitch':70,'pace':60,'rasp':50,'warmth':50}})
    assert 'asetrate=' in filters
    assert 'aresample=24000' in filters
    assert 'atempo=' in filters


def test_eq_is_subtle_and_uses_existing_ffmpeg_filters():
    filters=filter_chain({'sliders':{'pitch':50,'pace':50,'rasp':65,'warmth':75}})
    assert 'equalizer=f=250:' in filters
    assert 'equalizer=f=2500:' in filters


def test_invalid_traits_are_rejected():
    for value in [
        {'sliders':{'pitch':101}}, {'sliders':{'pace':-1}},
        {'sliders':{'warmth':2.5}}, {'sliders':{'unknown':50}},
        {'description':'x'*1201}, {'sliders':[]}
    ]:
        with pytest.raises(ValueError):
            normalize_refinement(value)


def test_existing_partial_settings_get_defaults():
    settings=normalize_refinement({'sliders':{'pitch':25},'description':'warm'})
    assert settings['sliders']['pitch']==25
    assert settings['sliders']['pace']==50
    assert settings['description']=='warm'


def test_prompt_guidance_suggests_but_does_not_force_settings():
    values=suggest_sliders('A deeper, slower, warmer and slightly raspy narration')
    assert values['pitch']<50
    assert values['pace']<50
    assert values['warmth']>50
    assert values['rasp']>50


def test_prompt_keeps_other_existing_slider_values():
    result=suggest_sliders('Speak slightly faster',{'sliders':{'pitch':32,'pace':50,'rasp':44,'warmth':60}})
    assert result['pitch']==32
    assert result['pace']>50
    assert result['rasp']==44
