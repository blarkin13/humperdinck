import io
import shutil
import subprocess

import pytest
from fastapi import HTTPException

from backend import entitlements


def test_mic_cloning_is_free_but_file_cloning_is_pro():
    assert entitlements.CAPABILITIES['voice.mic_cloning'] == 'free'
    assert entitlements.CAPABILITIES['voice.personal_cloning'] == 'pro'


@pytest.mark.skipif(not shutil.which('ffmpeg'), reason='needs ffmpeg')
def test_free_user_can_record_but_not_upload(tmp_path, monkeypatch):
    from fastapi.testclient import TestClient
    import backend.app as app_module
    monkeypatch.setattr(app_module, 'DATA', tmp_path)
    (tmp_path / 'voices').mkdir()
    wav = tmp_path / 'a.wav'
    subprocess.run(['ffmpeg', '-v', 'error', '-f', 'lavfi', '-i', 'sine=f=200:d=1', str(wav)], check=True)
    webm = tmp_path / 'a.webm'
    subprocess.run(['ffmpeg', '-v', 'error', '-i', str(wav), '-c:a', 'libopus', str(webm)], check=True)
    client = TestClient(app_module.app)
    recorded = client.post('/api/voices', files={'file': ('recording.webm', webm.read_bytes(), 'audio/webm')})
    assert recorded.status_code == 200, recorded.text
    uid = recorded.json()['voice_id']
    app_module.require_voice_selection('upload:' + uid)  # free: no error
    uploaded = client.post('/api/voices', files={'file': ('voice.wav', wav.read_bytes(), 'audio/wav')})
    assert uploaded.status_code in (402, 403)
