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



def test_mlx_qwen_requires_speech_tokenizer_files(tmp_path, monkeypatch):
    monkeypatch.setattr(catalog, 'hf_cache', lambda: tmp_path)
    model = 'mlx-community/Qwen3-TTS-12Hz-1.7B-VoiceDesign-8bit'
    snapshot = tmp_path / ('models--' + model.replace('/', '--')) / 'snapshots' / 'abc'
    snapshot.mkdir(parents=True)
    (snapshot / 'model.safetensors').write_text('weights')
    assert not catalog.downloaded(model)
    speech = snapshot / 'speech_tokenizer'
    speech.mkdir()
    (speech / 'config.json').write_text('{}')
    assert not catalog.downloaded(model)
    (speech / 'model.safetensors').write_text('decoder weights')
    assert catalog.downloaded(model)


def test_mlx_qwen_reports_missing_speech_tokenizer(monkeypatch):
    import sys
    import types
    from backend.qwen_engine import QwenVoiceDesigner

    fake_package = types.ModuleType('mlx_audio')
    fake_tts = types.ModuleType('mlx_audio.tts')
    fake_utils = types.ModuleType('mlx_audio.tts.utils')
    fake_utils.load_model = lambda model_id: types.SimpleNamespace(speech_tokenizer=None)
    monkeypatch.setitem(sys.modules, 'mlx_audio', fake_package)
    monkeypatch.setitem(sys.modules, 'mlx_audio.tts', fake_tts)
    monkeypatch.setitem(sys.modules, 'mlx_audio.tts.utils', fake_utils)
    try:
        QwenVoiceDesigner('mlx-community/Qwen3-TTS-12Hz-1.7B-VoiceDesign-8bit').load()
    except RuntimeError as exc:
        assert 'speech tokenizer' in str(exc)
        assert 'Models' in str(exc)
    else:
        raise AssertionError('Model loaded without its speech tokenizer')


def test_english_accent_language_hint():
    from backend.qwen_engine import design_language
    assert design_language('A native British English speaker, calm and natural.') == 'english'
    assert design_language('A Scottish man with an Edinburgh accent.') == 'english'
    assert design_language('An Australian woman with a relaxed voice.') == 'english'
    assert design_language('A warm narrator with an unhurried voice.') == 'auto'
    assert design_language('Une voix française douce.') == 'auto'


def test_cpu_preset_catalog_and_downloads(tmp_path, monkeypatch):
    monkeypatch.setattr(catalog, 'preset_path', lambda engine, voice: tmp_path / engine)
    kokoro = tmp_path / 'kokoro'
    piper = tmp_path / 'piper'
    kokoro.mkdir()
    piper.mkdir()
    assert not catalog.downloaded('bm_george')
    assert not catalog.downloaded('en_GB-alan-medium')
    with (kokoro / 'kokoro-v1.0.onnx').open('wb') as output:
        output.truncate(50_000_000)
    with (kokoro / 'voices-v1.0.bin').open('wb') as output:
        output.truncate(1_000_000)
    assert catalog.downloaded('bm_george')
    assert catalog.downloaded('bf_emma')  # Kokoro presets share the voicepack.
    with (piper / 'en_GB-alan-medium.onnx').open('wb') as output:
        output.truncate(1_000_000)
    (piper / 'en_GB-alan-medium.onnx.json').write_text('{"voice": "Alan", "padding": "' + 'x' * 200 + '"}')
    assert catalog.downloaded('en_GB-alan-medium')
    assert not catalog.downloaded('en_GB-cori-medium')
    assert 'bm_george' in catalog.ENGINES['kokoro']['models']
    assert 'en_GB-alan-medium' in catalog.ENGINES['piper']['models']
    catalog.validate('preset', 'kokoro', 'bm_george')
    catalog.validate('preset', 'piper', 'en_GB-alan-medium')
    try:
        catalog.validate('clone', 'kokoro', 'bm_george')
    except ValueError:
        pass
    else:
        raise AssertionError('Preset-only engine was accepted for arbitrary voice cloning')
