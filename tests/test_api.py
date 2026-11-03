"""End-to-end API smoke tests using a fake speech engine and a temporary data folder."""
import importlib
import shutil
import subprocess
import time

import numpy as np
import pytest
import soundfile as sf
from fastapi.testclient import TestClient

from backend import engines

SLIDERS = {'pitch': 50, 'rasp': 50, 'pace': 50, 'warmth': 50}


def fake_synthesize(engine, output, text, *, description='', reference=None, on_progress=None):
    # A distinct tone per call lets tests tell which reference/recipe produced audio.
    sf.write(str(output), np.sin(np.linspace(0, 440, 24000)).astype('float32') * 0.1, 24000)
    fake_synthesize.calls.append({'engine': engine, 'text': text, 'description': description, 'reference': reference})
    if on_progress:
        on_progress(1, 1)


@pytest.fixture
def client(tmp_path, monkeypatch):
    monkeypatch.setenv('VOICE_STUDIO_DATA', str(tmp_path))
    monkeypatch.setattr(engines, 'available', lambda engine: True)
    monkeypatch.setattr(engines, 'synthesize', fake_synthesize)
    fake_synthesize.calls = []
    import backend.app
    app_module = importlib.reload(backend.app)
    with TestClient(app_module.app) as c:
        c.module = app_module
        yield c


def wait(client, job):
    for _ in range(200):
        job = client.get(f"/api/jobs/{job['job_id']}").json()
        if job['status'] in ('complete', 'failed'):
            return job
        time.sleep(0.02)
    raise AssertionError('job did not finish')


def preview(client, description):
    job = client.post('/api/designed-voices/draft-preview',
                      json={'text': 'Hello there.', 'description': description, 'characteristics': SLIDERS}).json()
    assert wait(client, job)['status'] == 'complete'
    return job['job_id']


def narration_voice(client, voice_id):
    return next(v for v in client.get('/api/designed-voices').json() if v['id'] == voice_id)


def test_save_approve_edit_and_restore_keeps_voice_usable(client):
    # Mirrors the UI: create a voice, then attach and approve the chosen candidate.
    first = preview(client, 'A warm narrator.')
    voice = client.post('/api/designed-voices', json={'name': 'Narrator', 'description': 'A warm narrator.',
                                                      'characteristics': SLIDERS}).json()
    r = client.post(f"/api/designed-voices/{voice['id']}/versions/1/attach-preview", json={'job_id': first, 'approve': True})
    assert r.status_code == 200
    assert narration_voice(client, voice['id'])['narration_version'] == 1

    # Save Draft of an edit: v2 becomes current but unapproved; v1 must stay usable.
    client.post(f"/api/designed-voices/{voice['id']}/versions", json={'description': 'A gravelly narrator.', 'characteristics': SLIDERS})
    listed = narration_voice(client, voice['id'])
    assert listed['active_version'] == 2 and listed['approved_sample_id'] is None
    assert listed['narration_version'] == 1

    # Approving the edit switches narration to v2.
    second = preview(client, 'A gravelly narrator.')
    client.post(f"/api/designed-voices/{voice['id']}/versions/2/attach-preview", json={'job_id': second, 'approve': True})
    assert narration_voice(client, voice['id'])['narration_version'] == 2

    # Restoring v1 makes it the narration voice again.
    client.post(f"/api/designed-voices/{voice['id']}/versions/1/activate")
    assert narration_voice(client, voice['id'])['narration_version'] == 1

    # The same preview cannot be attached twice.
    r = client.post(f"/api/designed-voices/{voice['id']}/versions/1/attach-preview", json={'job_id': first, 'approve': True})
    assert r.status_code == 409


def test_missing_approved_file_falls_back_to_older_approval(client):
    voice = client.post('/api/designed-voices', json={'name': 'V', 'description': 'd', 'characteristics': SLIDERS}).json()
    client.post(f"/api/designed-voices/{voice['id']}/versions/1/attach-preview", json={'job_id': preview(client, 'd'), 'approve': True})
    client.post(f"/api/designed-voices/{voice['id']}/versions", json={'description': 'e', 'characteristics': SLIDERS})
    client.post(f"/api/designed-voices/{voice['id']}/versions/2/attach-preview", json={'job_id': preview(client, 'e'), 'approve': True})
    library = client.module.library
    library.latest_approved(voice['id'])['path'].unlink()
    assert library.latest_approved(voice['id'])['version'] == 1


def test_multi_voice_narration_uses_each_reference(client, tmp_path):
    voice = client.post('/api/designed-voices', json={'name': 'V', 'description': 'd', 'characteristics': SLIDERS}).json()
    client.post(f"/api/designed-voices/{voice['id']}/versions/1/attach-preview", json={'job_id': preview(client, 'd'), 'approve': True})
    upload = tmp_path / 'voices' / ('a' * 32 + '.wav')
    sf.write(str(upload), np.zeros(2400, dtype='float32'), 24000)
    job = client.post('/api/narrations', json={'format': 'wav', 'blocks': [
        {'text': 'One.', 'voice_key': 'design:' + voice['id']},
        {'text': 'Two.', 'voice_key': 'upload:' + 'a' * 32}]}).json()
    assert wait(client, job)['status'] == 'complete'
    references = [c['reference'] for c in fake_synthesize.calls if c['engine'] == 'chatterbox']
    assert references[1] == upload and references[0] != upload
    audio, rate = sf.read(tmp_path / 'outputs' / f"{job['job_id']}.wav")
    assert rate == 24000 and len(audio) == 24000 * 2 + int(24000 * .3)


def test_jobs_survive_restart_and_unfinished_jobs_are_marked_failed(client, tmp_path):
    from backend.jobs import JobStore
    jobs = client.module.jobs
    jobs['f' * 32] = {'status': 'complete', 'progress': 100}
    jobs['e' * 32] = {'status': 'running', 'progress': 40}
    reopened = JobStore(tmp_path / 'jobs.sqlite3')
    assert reopened.get('f' * 32)['status'] == 'complete'
    assert reopened.get('e' * 32)['status'] == 'failed'
    assert 'restart' in reopened.get('e' * 32)['message']


@pytest.mark.skipif(not shutil.which('ffmpeg'), reason='ffmpeg not installed')
def test_video_render_after_restart(client, tmp_path):
    voice_file = tmp_path / 'voices' / ('b' * 32 + '.wav')
    sf.write(str(voice_file), np.zeros(2400, dtype='float32'), 24000)
    narration = wait(client, client.post('/api/narrations', json={'format': 'wav', 'blocks': [
        {'text': 'Hi.', 'voice_key': 'upload:' + 'b' * 32}]}).json())
    video = tmp_path / 'clip.mp4'
    subprocess.run(['ffmpeg', '-v', 'error', '-f', 'lavfi', '-i', 'color=c=black:s=64x64:d=2', '-pix_fmt', 'yuv420p', str(video)], check=True)
    with video.open('rb') as f:
        video_id = client.post('/api/videos', files={'file': ('clip.mp4', f, 'video/mp4')}).json()['video_id']
    # Simulate a backend restart: the in-memory cache is gone, the job record is not.
    client.module.jobs.cache.clear()
    render = client.post('/api/video-renders', json={'video_id': video_id, 'narration_job_id': narration['job_id'], 'start_seconds': 0.5})
    assert render.status_code == 200, render.text
    done = wait(client, render.json())
    assert done['status'] == 'complete', done['message']
    assert (tmp_path / 'outputs' / f"{done['job_id']}.mp4").stat().st_size > 0


def test_engine_detection_reports_missing_interpreter(monkeypatch, tmp_path):
    monkeypatch.setenv('VOICE_STUDIO_QWEN_PYTHON', str(tmp_path / 'nope'))
    monkeypatch.setattr(engines, '_resolved', {})
    assert engines.candidates('qwen') == [tmp_path / 'nope']
    assert engines.python_for('qwen') is None


def make_voice(client, name='V', **extra):
    voice = client.post('/api/designed-voices', json={'name': name, 'description': 'd', 'characteristics': SLIDERS, **extra}).json()
    client.post(f"/api/designed-voices/{voice['id']}/versions/1/attach-preview", json={'job_id': preview(client, 'd'), 'approve': True})
    return voice


def test_categories_and_extra_traits(client):
    voice = make_voice(client, category='Narrators')
    assert narration_voice(client, voice['id'])['category'] == 'Narrators'
    client.patch(f"/api/designed-voices/{voice['id']}", json={'category': 'Villains'})
    assert narration_voice(client, voice['id'])['category'] == 'Villains'
    r = client.post('/api/designed-voices', json={'name': 'X', 'description': 'd',
                                                  'characteristics': {**SLIDERS, 'age': 90, 'energy': 10}})
    assert r.status_code == 201
    from backend.voice_library import build_instruction
    text = build_instruction('d', {**SLIDERS, 'age': 90, 'energy': 10})
    assert 'older' in text and 'low energy' in text
    assert client.post('/api/designed-voices', json={'name': 'X', 'description': 'd',
                                                     'characteristics': {**SLIDERS, 'bogus': 5}}).status_code == 422


def test_delete_version_falls_back_and_keeps_last(client):
    voice = make_voice(client)
    client.post(f"/api/designed-voices/{voice['id']}/versions", json={'description': 'e', 'characteristics': SLIDERS})
    sample = client.module.library.latest_approved(voice['id'])['path']
    r = client.delete(f"/api/designed-voices/{voice['id']}/versions/2")
    assert r.status_code == 200 and r.json()['active_version'] == 1
    assert client.delete(f"/api/designed-voices/{voice['id']}/versions/1").status_code == 409
    client.post(f"/api/designed-voices/{voice['id']}/versions", json={'description': 'f', 'characteristics': SLIDERS})
    client.delete(f"/api/designed-voices/{voice['id']}/versions/1")
    assert not sample.exists()
    assert narration_voice(client, voice['id'])['narration_version'] is None


def test_uploaded_voice_rename_category_delete(client, tmp_path):
    key = 'c' * 32
    sf.write(str(tmp_path / 'voices' / f'{key}.wav'), np.zeros(2400, dtype='float32'), 24000)
    (tmp_path / 'voices' / 'names.json').write_text('{"%s": "Old name"}' % key)  # legacy format
    assert client.get('/api/voices').json()[0]['filename'] == 'Old name'
    client.patch(f'/api/voices/{key}', json={'name': 'Homer', 'category': 'Cartoon'})
    assert client.get('/api/voices').json()[0] == {'voice_id': key, 'filename': 'Homer', 'category': 'Cartoon'}
    assert client.delete(f'/api/voices/{key}').status_code == 200
    assert client.get('/api/voices').json() == []


@pytest.mark.skipif(not shutil.which('ffmpeg'), reason='ffmpeg not installed')
def test_audio_edit_trims_and_creates_new_voice(client, tmp_path):
    key = 'd' * 32
    tone = np.sin(np.linspace(0, 2000, 24000 * 4)).astype('float32') * 0.3
    sf.write(str(tmp_path / 'voices' / f'{key}.wav'), tone, 24000)
    r = client.post('/api/audio/edit', json={'source': f'upload:{key}', 'start': 1, 'end': 3, 'fade_in': 0.2,
                                             'fade_out': 0.2, 'normalize': True, 'denoise': True, 'highpass': True})
    assert r.status_code == 200, r.text
    new = r.json()
    audio, rate = sf.read(tmp_path / 'voices' / f"{new['voice_id']}.wav")
    assert rate == 24000 and abs(len(audio) / rate - 2) < 0.05
    assert len(sf.read(tmp_path / 'voices' / f'{key}.wav')[0]) == 24000 * 4  # original untouched
    assert client.post('/api/audio/edit', json={'source': f'upload:{key}', 'start': 3, 'end': 2}).status_code == 422
    job = client.post('/api/narrations', json={'format': 'wav', 'blocks': [{'text': 'Hi.', 'voice_key': 'upload:' + key}]}).json()
    wait(client, job)
    edited = client.post('/api/audio/edit', json={'source': f"output:{job['job_id']}", 'speed': 1.5, 'trim_silence': True, 'fade_out': 0.1})
    assert edited.status_code == 200 and edited.json()['status'] == 'complete'


@pytest.mark.skipif(not shutil.which('ffmpeg'), reason='ffmpeg not installed')
def test_microphone_recording_upload(client, tmp_path):
    # Browsers record WebM/Opus; it must be converted to a 24 kHz mono reference.
    clip = tmp_path / 'My voice.webm'
    subprocess.run(['ffmpeg', '-v', 'error', '-f', 'lavfi', '-i', 'sine=frequency=220:duration=3', '-ac', '2',
                    '-c:a', 'libopus', str(clip)], check=True)
    with clip.open('rb') as f:
        r = client.post('/api/voices', files={'file': ('My voice.webm', f, 'audio/webm')})
    assert r.status_code == 200, r.text
    assert r.json()['filename'] == 'My voice'
    audio, rate = sf.read(tmp_path / 'voices' / f"{r.json()['voice_id']}.wav")
    assert rate == 24000 and audio.ndim == 1 and abs(len(audio) / rate - 3) < 0.1
