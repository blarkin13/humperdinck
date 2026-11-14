from fastapi import FastAPI
from fastapi.testclient import TestClient

from backend import network_server as net


def gated(token='abcde-fghjk-mnpqr-stuvw'):
    inner = FastAPI()
    inner.get('/api/health')(lambda: {'ok': True})
    inner.get('/api/server/settings')(lambda: {'secret': True})
    return TestClient(net.AccessGate(inner, lambda: token), follow_redirects=False), token


def test_requires_access_code():
    client, _ = gated()
    assert client.get('/api/health').status_code == 401
    assert client.get('/').status_code == 200  # login page
    assert client.get('/?access=wrong').status_code == 401


def test_pairing_sets_cookie_and_blocks_settings():
    client, token = gated()
    paired = client.get('/?access=' + token)
    assert paired.status_code == 303 and net.COOKIE in paired.headers['set-cookie']
    client.cookies.set(net.COOKIE, token)
    assert client.get('/api/health').json() == {'ok': True}
    assert client.get('/api/server/settings').status_code == 403


def test_bearer_token_and_config(tmp_path):
    client, token = gated()
    assert client.get('/api/health', headers={'Authorization': 'Bearer ' + token}).status_code == 200
    config = net.network_config(tmp_path / 's.json')
    assert config['network_enabled'] is False and config['network_port'] == net.DEFAULT_PORT
    assert len(config['network_token']) >= 16
    assert net.network_config(tmp_path / 's.json')['network_token'] == config['network_token']
