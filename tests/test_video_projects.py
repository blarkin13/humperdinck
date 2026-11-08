import json
import shutil
import subprocess

import pytest

from backend import video_projects as vp

FFMPEG = shutil.which('ffmpeg')


def project(**changes):
    p = vp.new_project('Test')
    p.update(changes)
    return p


def test_lengths_and_store(tmp_path):
    p = project(clips=[{'type': 'video', 'source_id': 'v', 'duration': 10, 'trim_start': 2, 'trim_end': 6},
                       {'type': 'image', 'source_id': 'i', 'duration': 3}],
                cues=[{'id': 'c', 'start': 5, 'length': 4, 'audio': 'a', 'text': 'Hi.'}])
    assert vp.clip_length(p['clips'][0]) == 4 and vp.total_length(p) == 9
    store = vp.Store(tmp_path)
    store.save(p)
    assert store.get(p['id'])['name'] == 'Test' and store.list()[0]['length'] == 9
    assert store.get('../x') is None and store.delete(p['id']) and store.list() == []


def test_captions_split_sentences_by_words():
    p = project(cues=[{'start': 1, 'length': 6, 'audio': 'a', 'text': '[excited] One two. Three four five six!'}])
    srt = vp.captions(p)
    assert '00:00:01,000 --> 00:00:03,000\nOne two.' in srt
    assert '00:00:03,000 --> 00:00:07,000\nThree four five six!' in srt


@pytest.mark.skipif(not FFMPEG, reason='ffmpeg not installed')
def test_render_mixes_clips_cues_and_padding(tmp_path):
    video, image, speech = tmp_path / 'v.mp4', tmp_path / 'i.png', tmp_path / 's.wav'
    run = lambda *a: subprocess.run([FFMPEG, '-v', 'error', '-y', *a], check=True)
    run('-f', 'lavfi', '-i', 'testsrc=s=320x240:d=2', '-f', 'lavfi', '-i', 'sine=d=2', '-shortest', str(video))
    run('-f', 'lavfi', '-i', 'testsrc=s=200x300:d=1', '-frames:v', '1', str(image))
    run('-f', 'lavfi', '-i', 'sine=f=300:d=1.5', str(speech))
    p = project(aspect='1:1',
                clips=[{'type': 'video', 'source_id': 'v', 'duration': 2, 'has_audio': True},
                       {'type': 'image', 'source_id': 'i', 'duration': 1.5},
                       {'type': 'image', 'source_id': 'i', 'duration': 1, 'motion': False},
                       {'type': 'color', 'color': '#203040', 'duration': 1}],
                cues=[{'start': 0.5, 'length': 1.5, 'audio': 'a'}, {'start': 6, 'length': 1.5, 'audio': 'a'}])
    files = {'video': video, 'image': image, 'audio': speech}
    out = tmp_path / 'out.mp4'
    subprocess.run(vp.render_command(p, lambda kind, _id: files[kind], out, FFMPEG,
                                     ['-c:v', 'mpeg4', '-q:v', '5']), check=True)
    probe = subprocess.run([FFMPEG.replace('ffmpeg', 'ffprobe'), '-v', 'error', '-show_entries',
                            'format=duration:stream=width,height,codec_type', '-of', 'json', str(out)],
                           capture_output=True, text=True, check=True)
    info = json.loads(probe.stdout)
    assert abs(float(info['format']['duration']) - 7.5) < 0.2  # last cue runs past the pictures
    video_stream = next(s for s in info['streams'] if s['codec_type'] == 'video')
    assert (video_stream['width'], video_stream['height']) == (1080, 1080)
    assert any(s['codec_type'] == 'audio' for s in info['streams'])


def test_caption_overlays_join_the_video_chain(tmp_path):
    project = video_projects.new_project()
    project['clips'] = [{'id': 'c', 'type': 'color', 'color': '#000000', 'duration': 3}]
    command = video_projects.render_command(project, lambda kind, i: tmp_path / i, tmp_path / 'o.mp4',
                                            overlays=[(tmp_path / '0.png', 0.5, 1.5)])
    graph = command[command.index('-filter_complex') + 1]
    assert "overlay=x=(W-w)/2:y=H-h" in graph and "between(t,0.500,1.500)" in graph
    assert command[command.index('-map') + 1] == '[vcap0]'
