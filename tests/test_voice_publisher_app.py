"""The Voice Publisher helper may only reach voice-publishing endpoints."""
import importlib.util
from pathlib import Path

import pytest

spec = importlib.util.spec_from_file_location(
    'voice_publisher_app', Path(__file__).resolve().parents[1] / 'scripts' / 'voice_publisher_app.py')
app = importlib.util.module_from_spec(spec)
spec.loader.exec_module(app)
JOB = 'a' * 32


@pytest.mark.parametrize('method,path', [
    ('GET', '/api/voices'), ('POST', '/api/voices'), ('PATCH', '/api/voices/abc123'),
    ('GET', '/api/starter-voices'), ('POST', '/api/starter-voices/abc/generate'),
    ('POST', '/api/starter-voices/abc/approve'), ('PUT', '/api/starter-voices/abc/channel'),
    ('PATCH', '/api/starter-voices/abc'), ('DELETE', '/api/starter-voices/abc'),
    ('POST', '/api/starter-voices/publish'), ('GET', f'/api/jobs/{JOB}'),
    ('GET', f'/api/outputs/{JOB}.wav'), ('GET', '/api/starter-voices/abc/sample.wav'),
    ('POST', '/api/designed-voices/draft-preview'), ('POST', '/api/designed-voices'),
    ('POST', '/api/designed-voices/abc/versions/2/attach-preview'), ('POST', '/api/voice-refinement/suggest'),
    ('PUT', '/api/voices/abc/refinement'), ('POST', '/api/voices/abc/refinement-preview'),
    ('POST', '/api/starter-voices/from-design/abc'),
])
def test_voice_publishing_is_allowed(method, path):
    assert app.allowed(method, path)


@pytest.mark.parametrize('method,path', [
    ('POST', '/api/narrations'), ('POST', '/api/generate'), ('GET', '/api/settings'),
    ('DELETE', '/api/voices/abc'), ('POST', '/api/account/logout'), ('GET', '/api/models'),
    ('POST', '/api/video-projects/x/render'), ('GET', f'/api/outputs/{JOB}.mp4'),
    ('GET', '/api/voices/../settings'), ('GET', '/api/voices/abc%2F..%2Fx/audio'),
    ('GET', '/api/voices/abc/audio/extra'), ('POST', '/api/starter-voices/export'),
    ('POST', '/api/voices/abc'), ('GET', '/api/starter-voices/publish/x'),
])
def test_everything_else_is_refused(method, path):
    assert not app.allowed(method, path)


def test_publisher_unlocks_every_voice_feature():
    source = (Path(__file__).resolve().parents[1] / 'scripts' / 'voice_publisher_app.py').read_text()
    assert "HUMPERDINCK_DEV_PRO='1'" in source and "HUMPERDINCK_ENABLE_DEV_ENTITLEMENTS='1'" in source
