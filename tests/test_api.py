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


def fake_synthesize(engine, output, text, *, model, mode, description='', reference=None, ref_text=None, on_progress=None):
    # A distinct tone per call lets tests tell which reference/recipe produced audio.
    sf.write(str(output), np.sin(np.linspace(0, 440, 24000)).astype('float32') * 0.1, 24000)
    fake_synthesize.calls.append({'engine': engine, 'model': model, 'mode': mode, 'text': text,
                                 'description': description, 'reference': reference, 'ref_text': ref_text})
    if on_progress:
        on_progress(1, 1)


@pytest.fixture
def client(tmp_path, monkeypatch):
    monkeypatch.setenv('HUMPERDINCK_DATA', str(tmp_path))
    # Existing API integration cases exercise the full creator in source-only preview.
    monkeypatch.setenv('HUMPERDINCK_ENABLE_DEV_ENTITLEMENTS', '1')
    monkeypatch.setenv('HUMPERDINCK_DEV_PRO', '1')
    monkeypatch.delenv('HUMPERDINCK_NATIVE_PACKAGE', raising=False)
    monkeypatch.setattr(engines, 'available', lambda engine: True)
    monkeypatch.setattr(engines, 'installed', lambda engine: True)
    monkeypatch.setattr(engines, 'synthesize', fake_synthesize)
    monkeypatch.setattr('backend.catalog.downloaded', lambda model: True)
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
    references = [c['reference'] for c in fake_synthesize.calls if c['mode'] == 'clone']
    assert references[1] == upload and references[0] != upload
    audio, rate = sf.read(tmp_path / 'outputs' / f"{job['job_id']}.wav")
    assert rate == 24000 and len(audio) == 24000 * 2  # default section delay is 0


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
    monkeypatch.setenv('HUMPERDINCK_QWEN_MLX_PYTHON', str(tmp_path / 'nope'))
    monkeypatch.setattr(engines, '_resolved', {})
    assert engines.candidates('qwen-mlx') == [tmp_path / 'nope']
    assert engines.python_for('qwen-mlx') is None


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
    voice = client.get('/api/voices').json()[0]
    assert (voice['voice_id'], voice['filename'], voice['category']) == (key, 'Homer', 'Cartoon')
    assert voice['duration'] and voice['sample_rate'] and voice['origin'] == 'uploaded'
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
        r = client.post('/api/voices', files={'file': ('My voice.webm', f, 'audio/webm')}, data={'consent_attestation':'humperdinck-voice-consent-v1','consent_subject':'self'})
    assert r.status_code == 200, r.text
    assert r.json()['filename'] == 'My voice'
    assert client.get('/api/voices').json()[0]['origin'] == 'recorded'
    audio, rate = sf.read(tmp_path / 'voices' / f"{r.json()['voice_id']}.wav")
    assert rate == 24000 and audio.ndim == 1 and abs(len(audio) / rate - 3) < 0.1



@pytest.mark.skipif(not shutil.which('ffmpeg'), reason='ffmpeg not installed')
def test_voice_upload_requires_explicit_signed_consent_acknowledgement(client, tmp_path):
    clip = tmp_path / 'own.wav'
    sf.write(str(clip), np.zeros(24000, dtype='float32'), 24000)
    # A Pro entitlement is required for uploaded files; use the Free microphone
    # recording format here to verify consent checks without a paid grant.
    webm = tmp_path / 'own.webm'
    subprocess.run(['ffmpeg','-v','error','-i',str(clip),'-c:a','libopus',str(webm)],check=True)
    with webm.open('rb') as f:
        response = client.post('/api/voices', files={'file':('own.webm',f,'audio/webm')})
    assert response.status_code == 422
    assert list((tmp_path/'voices').glob('*.wav')) == []
    with webm.open('rb') as f:
        bad = client.post('/api/voices', files={'file':('own.webm',f,'audio/webm')},
                          data={'consent_attestation':'humperdinck-voice-consent-v1',
                                'consent_subject':'unknown'})
    assert bad.status_code == 422
    with webm.open('rb') as f:
        ok = client.post('/api/voices', files={'file':('own.webm',f,'audio/webm')},
                         data={'consent_attestation':'humperdinck-voice-consent-v1',
                               'consent_subject':'self'})
    assert ok.status_code == 200, ok.text
    meta = client.get('/api/voices').json()[0]
    # The acknowledgement must never be advertised as verified speaker identity.
    assert meta.get('origin') == 'recorded'

@pytest.mark.skipif(not shutil.which('ffmpeg'), reason='ffmpeg not installed')
def test_ogg_voice_upload_normalizes_to_wav(client, tmp_path):
    clip = tmp_path / 'British narrator.ogg'
    subprocess.run([
        'ffmpeg', '-v', 'error', '-f', 'lavfi', '-i',
        'sine=frequency=440:duration=2', '-c:a', 'libvorbis', str(clip)
    ], check=True)
    with clip.open('rb') as source:
        result = client.post('/api/voices', files={
            'file': ('British narrator.ogg', source, 'audio/ogg')
        }, data={'consent_attestation':'humperdinck-voice-consent-v1','consent_subject':'authorized'})
    assert result.status_code == 200, result.text
    assert result.json()['filename'] == 'British narrator'
    output = tmp_path / 'voices' / (result.json()['voice_id'] + '.wav')
    assert output.is_file()
    samples, rate = sf.read(output)
    assert rate == 24000
    assert samples.ndim == 1
    assert abs(len(samples) / rate - 2) < 0.1


def test_slider_prompt_strength_and_legacy_recipe():
    from backend.voice_library import build_instruction
    neutral = {'pitch': 50, 'rasp': 50, 'pace': 50, 'warmth': 50}
    assert build_instruction('A documentary voice.', neutral) == 'A documentary voice.'
    mild = build_instruction('A documentary voice.', {**neutral, 'rasp': 72})
    strong = build_instruction('A documentary voice.', {**neutral, 'rasp': 95})
    assert 'slightly gravelly' in mild
    assert 'pronounced gravelly' in strong
    assert mild != strong
    assert 'very low speaking pitch' in build_instruction('Voice.', {**neutral, 'pitch': 5})
    legacy = 'A masculine-presenting adult voice with midrange pitch, slightly textured texture, conversational pace and balanced resonance.'
    assert build_instruction(legacy, {**neutral, 'rasp': 100}) == legacy


def test_installed_preset_voices_are_available_and_render_without_cloning(client):
    available = client.get('/api/preset-voices')
    assert available.status_code == 200
    voices = available.json()
    assert any(v['key'] == 'preset:kokoro:bm_george' for v in voices)
    assert not any(v['key'].startswith('preset:piper:') for v in voices)

    job = client.post('/api/narrations', json={
        'blocks': [{'text': 'Good evening from London.', 'voice_key': 'preset:kokoro:bm_george'},
                   {'text': 'Good morning from New York.', 'voice_key': 'preset:kokoro:af_heart'}],
        'format': 'wav',
    })
    assert job.status_code == 200, job.text
    complete = wait(client, job.json())
    assert complete['status'] == 'complete', complete
    calls = fake_synthesize.calls
    assert [c['engine'] for c in calls] == ['kokoro', 'kokoro']
    assert [c['mode'] for c in calls] == ['preset', 'preset']
    assert all(c['reference'] is None for c in calls)


def test_bad_preset_voice_is_rejected(client):
    r = client.post('/api/narrations', json={
        'blocks': [{'text': 'Hello.', 'voice_key': 'preset:kokoro:no-such-voice'}],
        'format': 'wav',
    })
    assert r.status_code == 400


def test_standard_preview_is_shared_across_builtin_and_uploaded_voices(client, tmp_path):
    sentence = 'Good evening. I have been waiting a long time to tell you this story.'
    # All library cards request the same spoken text; output is cached per identity.
    first = client.post('/api/voice-previews', json={'voice_key': 'preset:kokoro:bm_george'})
    assert first.status_code == 200, first.text
    finished = wait(client, first.json())
    assert finished['status'] == 'complete', finished
    assert finished['download_url'].endswith('.wav')
    assert client.get(finished['download_url']).status_code == 200
    assert fake_synthesize.calls[-1]['text'] == sentence
    assert fake_synthesize.calls[-1]['engine'] == 'kokoro'
    assert fake_synthesize.calls[-1]['mode'] == 'preset'

    previous_count = len(fake_synthesize.calls)
    cached = client.post('/api/voice-previews', json={'voice_key': 'preset:kokoro:bm_george'})
    assert cached.json()['status'] == 'complete'
    assert cached.json()['download_url'] == finished['download_url']
    assert len(fake_synthesize.calls) == previous_count

    voice_id = 'a' * 32
    sf.write(str(tmp_path / 'voices' / f'{voice_id}.wav'), np.zeros(2400, dtype='float32'), 24000)
    uploaded = client.post('/api/voice-previews', json={'voice_key': 'upload:' + voice_id})
    done = wait(client, uploaded.json())
    assert done['status'] == 'complete', done
    assert fake_synthesize.calls[-1]['text'] == sentence
    assert fake_synthesize.calls[-1]['mode'] == 'clone'


def test_standard_designed_voice_preview_uses_approved_reference(client):
    voice = client.post('/api/designed-voices', json={
        'name': 'Standard test voice', 'description': 'A calm narrator.',
        'characteristics': SLIDERS}).json()
    first = client.post('/api/voice-previews', json={'voice_key': 'design:' + voice['id']})
    done = wait(client, first.json())
    assert done['status'] == 'complete', done
    assert fake_synthesize.calls[-1]['mode'] == 'design'
    assert fake_synthesize.calls[-1]['text'] == client.module.VOICE_PREVIEW_TEXT

    approved_job_id = preview(client, 'A calm narrator.')
    attach = client.post(f"/api/designed-voices/{voice['id']}/versions/1/attach-preview",
                         json={'job_id': approved_job_id, 'approve': True})
    assert attach.status_code == 200
    new = client.post('/api/voice-previews', json={'voice_key': 'design:' + voice['id']})
    done = wait(client, new.json())
    assert done['status'] == 'complete', done
    assert fake_synthesize.calls[-1]['mode'] == 'clone'
    assert fake_synthesize.calls[-1]['text'] == client.module.VOICE_PREVIEW_TEXT


def test_standard_preview_rejects_invalid_voice_keys(client):
    assert client.post('/api/voice-previews', json={'voice_key': 'preset:kokoro:missing'}).status_code == 400
    assert client.post('/api/voice-previews', json={'voice_key': 'upload:doesnotexist'}).status_code == 400
    assert client.get('/api/voice-previews/../something.wav').status_code in (400, 404)


def test_free_has_all_studios_and_cannot_create_personal_qwen_voices(client, monkeypatch):
    monkeypatch.delenv('HUMPERDINCK_DEV_PRO')
    state = client.get('/api/entitlements').json()
    assert state['plan'] == 'free'
    assert state['capabilities']['studio.narration']
    assert state['capabilities']['studio.video']
    assert state['capabilities']['voice.builtin_qwen']
    assert state['capabilities']['audio.export']
    assert not state['capabilities']['voice.personal_cloning']
    assert not state['license_activated'] and not state['checkout_available']

    blocked = [
        client.post('/api/voices', files={'file': ('clip.wav', b'not audio', 'audio/wav')}),
        client.post('/api/designed-voices', json={
            'name': 'Private voice', 'description': 'Description', 'characteristics': SLIDERS}),
        client.post('/api/designed-voices/draft-preview', json={
            'text': 'Hi.', 'description': 'My voice', 'characteristics': SLIDERS}),
        client.post('/api/generate', json={
            'text': 'Hi.', 'voice_description': 'Personal', 'engine': 'qwen-design', 'format': 'wav'}),
        client.post('/api/generate', json={
            'text': 'Hi.', 'voice_id': 'f' * 32, 'engine': 'qwen-clone', 'format': 'wav'}),
        client.post('/api/voice-catalog/' + 'a' * 32 + '/download'),
    ]
    for response in blocked:
        assert response.status_code == 403, response.text
        assert response.json()['detail']['code'] == 'PRO_REQUIRED'

    # Free can generate, regenerate and export narration with Kokoro.
    response = client.post('/api/narrations', json={
        'format': 'wav', 'blocks': [{'text': 'Free local narration.', 'voice_key': 'preset:kokoro:bm_george'}]})
    assert response.status_code == 200, response.text
    assert wait(client, response.json())['status'] == 'complete'


def test_bundled_qwen_reference_allowed_free_but_personal_lookalike_blocked(client, tmp_path, monkeypatch):
    import json
    from hashlib import sha256

    uid = 'a' * 32
    source = tmp_path / 'voices' / (uid + '.wav')
    sf.write(source, np.zeros(24000, dtype='float32'), 24000)
    digest = sha256(source.read_bytes()).hexdigest()
    client.module.save_voice_meta({
        uid: {'name': 'Curated narrator', 'origin': 'builtin-humperdinck',
              'reference_text': client.module.STARTER_VOICE_TEXT, 'builtin_sha256': digest}
    })
    monkeypatch.delenv('HUMPERDINCK_DEV_PRO')
    assert client.get('/api/entitlements').json()['plan'] == 'free'

    response = client.post('/api/narrations', json={'format': 'wav', 'blocks': [
        {'text': 'The old lighthouse remained open.', 'voice_key': 'upload:' + uid}]})
    assert response.status_code == 200, response.text
    assert wait(client, response.json())['status'] == 'complete'
    assert fake_synthesize.calls[-1]['mode'] == 'clone'

    # Curated bytes changed without an approved update: no silent Free exception.
    source.write_bytes(source.read_bytes() + b'tamper')
    response = client.post('/api/narrations', json={'format': 'wav', 'blocks': [
        {'text': 'Not a trusted curated sample.', 'voice_key': 'upload:' + uid}]})
    assert response.status_code == 403, response.text

    # Display names/categories never decide access to the restricted Qwen path.
    client.module.save_voice_meta({uid: {'name': 'Built-In Humperdinck Voice',
        'category': 'Built-In Humperdinck Voices', 'origin': 'uploaded'}})
    response = client.post('/api/generate', json={'text': 'Hello.',
        'voice_id': uid, 'engine': 'qwen-clone', 'format': 'wav'})
    assert response.status_code == 403, response.text


def test_free_cannot_use_prior_custom_voice_or_preview(client, monkeypatch):
    preview_job_id = preview(client, 'A custom personal voice.')
    made = client.post('/api/designed-voices', json={
        'name': 'Custom', 'description': 'A custom personal voice.',
        'characteristics': SLIDERS}).json()
    assert client.post(f"/api/designed-voices/{made['id']}/versions/1/attach-preview",
        json={'job_id': preview_job_id, 'approve': True}).status_code == 200

    monkeypatch.delenv('HUMPERDINCK_DEV_PRO')
    custom_key = 'design:' + made['id']
    assert client.post('/api/narrations', json={'format': 'wav', 'blocks': [
        {'text': 'Personal voice', 'voice_key': custom_key}]}).status_code == 403
    assert client.post('/api/voice-previews', json={'voice_key': custom_key}).status_code == 403
    assert client.get('/api/designed-voices').status_code == 200  # never hide/delete a purchase's files


def test_pro_preview_requires_explicit_source_mode_and_never_activates_native(client, monkeypatch):
    assert client.get('/api/entitlements').json()['plan'] == 'pro'
    assert client.get('/api/entitlements').json()['development_preview']
    monkeypatch.setenv('HUMPERDINCK_NATIVE_PACKAGE', '1')
    result = client.get('/api/entitlements').json()
    assert result['plan'] == 'free'
    assert not result['development_preview']
    monkeypatch.delenv('HUMPERDINCK_NATIVE_PACKAGE')
    monkeypatch.delenv('HUMPERDINCK_ENABLE_DEV_ENTITLEMENTS')
    assert client.get('/api/entitlements').json()['plan'] == 'free'



def test_local_license_api_requires_signed_certificate(client, monkeypatch):
    monkeypatch.delenv('HUMPERDINCK_DEV_PRO', raising=False)
    state = client.get('/api/license')
    assert state.status_code == 200
    assert state.json()['plan'] == 'free'
    forged = 'A' * 200 + '.' + 'B' * 86
    response = client.post('/api/license/import', json={'license': forged})
    assert response.status_code == 400, response.text
    assert client.get('/api/entitlements').json()['plan'] == 'free'
    assert client.get('/api/license/export').status_code == 404
