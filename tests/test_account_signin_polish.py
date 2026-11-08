"""Desktop sign-in: survives restarts and blips, notices remote sign-out, never touches the offline license."""
import json
import time

from fastapi import HTTPException

from backend import account_client


def _signed_in(tmp_path):
    account_client._save(tmp_path, {'token': 't' * 43, 'expires_at': int(time.time()) + 3600,
                                    'user': {'id': 'u1', 'email': 'a@b.test', 'display_name': 'A'}})


def test_session_survives_restart_without_network(tmp_path):
    _signed_in(tmp_path)
    account_client._pending = None  # a fresh process has no pending state
    assert account_client.status(tmp_path)['connected']


def test_verify_signs_out_locally_when_revoked_online(tmp_path, monkeypatch):
    _signed_in(tmp_path)
    license_file = tmp_path / 'pro-license.json'
    license_file.write_text('{"keep": true}')
    monkeypatch.setattr(account_client, '_call', lambda path, payload=None, token=None: {'authenticated': False})
    assert account_client.verify(tmp_path) == {'connected': False, 'revoked': True}
    assert not (tmp_path / 'account-session.json').exists()
    assert json.loads(license_file.read_text()) == {'keep': True}


def test_verify_treats_401_as_revoked(tmp_path, monkeypatch):
    _signed_in(tmp_path)
    def fail(*a, **k):
        raise HTTPException(401, 'Unauthorized')
    monkeypatch.setattr(account_client, '_call', fail)
    assert account_client.verify(tmp_path)['revoked']


def test_verify_keeps_session_when_offline(tmp_path, monkeypatch):
    _signed_in(tmp_path)
    def offline(*a, **k):
        raise HTTPException(503, 'Could not reach Humperdinck accounts')
    monkeypatch.setattr(account_client, '_call', offline)
    result = account_client.verify(tmp_path)
    assert result['connected'] and result['offline']
    assert (tmp_path / 'account-session.json').exists()


def test_verify_confirms_valid_session(tmp_path, monkeypatch):
    _signed_in(tmp_path)
    seen = []
    def me(path, payload=None, token=None):
        seen.append((path, token))
        return {'authenticated': True}
    monkeypatch.setattr(account_client, '_call', me)
    assert account_client.verify(tmp_path)['connected']
    assert seen == [('me', 't' * 43)]


def test_poll_keeps_waiting_through_server_blips_and_reports_url(tmp_path, monkeypatch):
    url = 'https://humperdinck.studio/account/?device=ABCDEFGHIJ'
    account_client._pending = {'request_id': 'a' * 43, 'verifier': 'v' * 43,
                               'verification_url': url, 'expires_at': time.time() + 600}
    def blip(*a, **k):
        raise HTTPException(503, 'Account service unavailable')
    monkeypatch.setattr(account_client, '_call', blip)
    assert account_client.poll(tmp_path) == {'pending': True, 'retrying': True}
    assert account_client._pending is not None
    monkeypatch.setattr(account_client, '_call', lambda *a, **k: {'status': 'pending'})
    assert account_client.poll(tmp_path) == {'pending': True, 'verification_url': url}


def test_poll_stops_on_rejected_request(tmp_path, monkeypatch):
    account_client._pending = {'request_id': 'a' * 43, 'verifier': 'v' * 43, 'expires_at': time.time() + 600}
    def denied(*a, **k):
        raise HTTPException(403, 'Denied')
    monkeypatch.setattr(account_client, '_call', denied)
    try:
        account_client.poll(tmp_path)
        raise AssertionError('expected 403')
    except HTTPException as exc:
        assert exc.status_code == 403
    assert account_client._pending is None


def test_requests_identify_the_desktop_app(monkeypatch):
    seen = {}
    class Response:
        def __enter__(self): return self
        def __exit__(self, *a): return False
        def read(self, n): return b'{"available": true}'
    def fake_urlopen(request, timeout, context):
        seen['ua'] = request.get_header('User-agent')
        seen['context'] = context
        return Response()
    monkeypatch.setattr(account_client.urllib.request, 'urlopen', fake_urlopen)
    assert account_client._call('config') == {'available': True}
    assert seen['ua'].startswith('Humperdinck-Desktop/')
    assert seen['context'] is not None


def test_open_page_only_opens_fixed_destinations(monkeypatch):
    opened = []
    monkeypatch.setattr(account_client.webbrowser, 'open', lambda url: opened.append(url) or True)
    url = 'https://humperdinck.studio/account/?device=ABCDEFGHIJ'
    account_client._pending = {'request_id': 'a' * 43, 'verifier': 'v' * 43,
                               'verification_url': url, 'expires_at': time.time() + 600}
    assert account_client.open_page('signin') == {'opened': True}
    assert account_client.open_page('dashboard') == {'opened': True}
    assert opened == [url, 'https://humperdinck.studio/account/']
    for bad in ('https://evil.test', '../x'):
        try:
            account_client.open_page(bad)
            raise AssertionError('expected 400')
        except HTTPException as exc:
            assert exc.status_code == 400
    account_client._pending = None
    try:
        account_client.open_page('signin')
        raise AssertionError('expected 409')
    except HTTPException as exc:
        assert exc.status_code == 409
