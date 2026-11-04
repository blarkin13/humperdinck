"""Model catalog, saved choices and the Models API."""
import json

from backend import catalog
from tests.test_api import client, wait  # noqa: F401 (fixture)


def test_defaults_are_supported_and_valid():
    for role, choice in catalog.defaults().items():
        assert catalog.supported(choice['engine'])
        catalog.validate(role, choice['engine'], choice['model'])


def test_settings_round_trip_and_reject_wrong_role(tmp_path):
    settings = catalog.Settings(tmp_path / 'settings.json')
    assert settings.load() == catalog.defaults()
    settings.save('clone', 'qwen-torch', 'Qwen/Qwen3-TTS-12Hz-0.6B-Base')
    assert json.loads((tmp_path / 'settings.json').read_text())['models']['clone']['engine'] == 'qwen-torch'
    assert settings.load()['clone']['model'] == 'Qwen/Qwen3-TTS-12Hz-0.6B-Base'
    try:
        settings.save('clone', 'qwen-torch', 'Qwen/Qwen3-TTS-12Hz-1.7B-VoiceDesign')
    except ValueError:
        pass
    else:
        raise AssertionError('a design-only model was accepted for cloning')


def test_models_api_lists_engines_and_saves_choice(client):  # noqa: F811
    data = client.get('/api/models').json()
    assert {e['id'] for e in data['engines']} == set(catalog.ENGINES)
    r = client.put('/api/models/selection', json={'role': 'clone', 'engine': 'qwen-torch', 'model': 'Qwen/Qwen3-TTS-12Hz-0.6B-Base'})
    assert r.status_code == 200 and r.json()['clone']['engine'] == 'qwen-torch'
    assert client.put('/api/models/selection', json={'role': 'clone', 'engine': 'nope', 'model': 'x'}).status_code == 422


def test_install_rejects_unknown_engine_and_model(client):  # noqa: F811
    assert client.post('/api/models/install', json={'engine': 'nope'}).status_code == 422
    assert client.post('/api/models/install', json={'engine': 'chatterbox', 'model': 'bad/model'}).status_code == 422


def test_partial_download_is_not_downloaded(tmp_path, monkeypatch):
    monkeypatch.setattr(catalog, 'hf_cache', lambda: tmp_path)
    repo = tmp_path / 'models--Org--Voice'
    snapshot = repo / 'snapshots' / 'abc'
    snapshot.mkdir(parents=True)
    (snapshot / 'config.json').write_text('{}')
    assert not catalog.downloaded('Org/Voice')  # config only, no weights
    (snapshot / 'model.safetensors').write_text('x')
    (repo / 'blobs').mkdir()
    (repo / 'blobs' / 'deadbeef.incomplete').write_text('')
    assert not catalog.downloaded('Org/Voice')  # still downloading or interrupted
    (repo / 'blobs' / 'deadbeef.incomplete').unlink()
    assert catalog.downloaded('Org/Voice')
