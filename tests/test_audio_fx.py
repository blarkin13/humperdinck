import shutil
import subprocess

import pytest

from backend import audio_fx, video_projects


def test_chain_off_when_nothing_to_do():
    assert audio_fx.chain({'enabled': False}) == ''
    assert audio_fx.chain(None, 0, 1) != ''  # defaults: clean-up and level match on


def test_chain_includes_eq_compression_gain_and_pace():
    desk = {'enabled': True, 'cleanup': True, 'low': 3, 'mid': -2, 'high': 4,
            'compress': 'gentle', 'level_match': True}
    filters = audio_fx.chain(desk, gain=-3, speed=1.1)
    for part in ('highpass', 'bass=g=3.0', 'equalizer=f=1800', 'treble=g=4.0', 'acompressor',
                 'loudnorm', 'volume=-3.0dB', 'atempo=1.100', 'alimiter'):
        assert part in filters


def test_chain_clamps_extremes():
    filters = audio_fx.chain({'enabled': True, 'low': 99, 'level_match': False, 'cleanup': False}, gain=50, speed=9)
    assert 'bass=g=12.0' in filters and 'volume=12.0dB' in filters and 'atempo=2.000' in filters


def test_cue_speed_changes_timing():
    cue = {'start': 2, 'length': 6, 'speed': 1.5, 'audio': 'x'}
    assert video_projects.cue_end(cue) == pytest.approx(6)


@pytest.mark.skipif(not shutil.which('ffmpeg'), reason='needs ffmpeg')
def test_process_runs(tmp_path):
    wav = tmp_path / 'v.wav'
    subprocess.run(['ffmpeg', '-v', 'error', '-f', 'lavfi', '-i', 'sine=f=220:d=1', '-ar', '24000', '-ac', '1', str(wav)], check=True)
    assert audio_fx.process(wav, 24000, {'enabled': True, 'low': 4, 'compress': 'strong'}, gain=2, speed=1.25)
    out = subprocess.run(['ffprobe', '-v', 'error', '-show_entries', 'format=duration:stream=sample_rate', '-of', 'csv=p=0', str(wav)],
                         capture_output=True, text=True, check=True).stdout.split()
    assert out[0] == '24000' and float(out[1]) == pytest.approx(0.8, abs=0.05)
