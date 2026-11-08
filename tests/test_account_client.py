"""Local account client remains optional; tokens never enter the browser UI."""
import os
import time
from backend import account_client


def test_connect_and_poll_keep_bearer_out_of_ui(tmp_path, monkeypatch):
    account_client._pending = None
    verifier_calls = []
    def fake_call(path, payload=None, token=None):
        verifier_calls.append((path, payload, token))
        if path == 'device/begin':
            assert isinstance(payload['challenge'], str) and len(payload['challenge']) == 43
            return {'request_id': 'a' * 43,
                    'verification_url': 'https://humperdinck.studio/account/?device=ABCDEFGHIJ',
                    'expires_in': 600}
        if path == 'device/poll':
            assert payload['request_id'] == 'a' * 43 and len(payload['verifier']) == 43
            return {'status': 'complete', 'access_token': 't' * 43,
                    'expires_at': int(time.time())+3600,
                    'user': {'id': 'id-1', 'email': 'example@domain.test', 'display_name': 'Example'}}
        if path == 'logout':
            assert token == 't' * 43
            return {'ok': True}
        raise AssertionError(path)
    monkeypatch.setattr(account_client, '_call', fake_call)
    monkeypatch.setattr(account_client.webbrowser, 'open', lambda url: True)
    assert account_client.status(tmp_path) == {'connected': False}
    start = account_client.begin()
    assert start['pending'] and start['browser_opened']
    assert 'verifier' not in start and 'token' not in start
    response = account_client.poll(tmp_path)
    assert response['connected'] and not response['pending']
    assert response['user']['email'] == 'example@domain.test'
    assert 'token' not in str(response)
    session_file = tmp_path / 'account-session.json'
    assert session_file.is_file()
    assert 't' * 43 in session_file.read_text()
    if os.name == 'posix':
        assert session_file.stat().st_mode & 0o077 == 0
    result = account_client.disconnect(tmp_path)
    assert result['online_session_revoked'] and not session_file.exists()
    assert account_client.status(tmp_path) == {'connected': False}


def test_offline_account_absence_does_not_require_login(tmp_path, monkeypatch):
    account_client._pending = None
    assert account_client.status(tmp_path) == {'connected': False}
    # Local account status makes no network call when no session exists.
    monkeypatch.setattr(account_client, '_call', lambda *args, **kwargs: (_ for _ in ()).throw(AssertionError('network')))
    assert account_client.status(tmp_path) == {'connected': False}
