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
    assert client.post('/api/models/install', json={'engine': 'qwen-torch', 'model': 'bad/model'}).status_code == 422


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
    kokoro.mkdir()
    assert not catalog.downloaded('bm_george')
    with (kokoro / 'kokoro-v1.0.onnx').open('wb') as output:
        output.truncate(50_000_000)
    with (kokoro / 'voices-v1.0.bin').open('wb') as output:
        output.truncate(1_000_000)
    assert catalog.downloaded('bm_george')
    assert catalog.downloaded('bf_emma')  # Kokoro presets share the voicepack.
    assert 'bm_george' in catalog.ENGINES['kokoro']['models']
    assert 'piper' not in catalog.ENGINES
    catalog.validate('preset', 'kokoro', 'bm_george')
    try:
        catalog.validate('clone', 'kokoro', 'bm_george')
    except ValueError:
        pass
    else:
        raise AssertionError('Preset-only engine was accepted for arbitrary voice cloning')


def test_delete_hf_model_does_not_touch_another_repository(tmp_path, monkeypatch):
    monkeypatch.setattr(catalog, 'hf_cache', lambda: tmp_path)
    model = 'Qwen/Qwen3-TTS-12Hz-0.6B-Base'
    target = tmp_path / ('models--' + model.replace('/', '--'))
    target.mkdir()
    (target / 'weights.safetensors').write_text('weights')
    other = tmp_path / 'models--unrelated--model'
    other.mkdir()
    (other / 'weights.safetensors').write_text('untouched')
    assert catalog.delete_downloaded_model('qwen-torch', model)
    assert not target.exists()
    assert (other / 'weights.safetensors').read_text() == 'untouched'
    assert not catalog.delete_downloaded_model('qwen-torch', model)


def test_delete_kokoro_removes_only_shared_bundle(tmp_path, monkeypatch):
    monkeypatch.setattr(catalog, 'preset_path', lambda engine, voice: tmp_path / engine)
    folder = tmp_path / 'kokoro'
    folder.mkdir()
    (folder / 'kokoro-v1.0.onnx').write_text('model')
    (folder / 'voices-v1.0.bin').write_text('voicepack')
    (folder / 'personal.wav').write_text('recording')
    assert catalog.delete_downloaded_model('kokoro', 'bm_george')
    assert not (folder / 'kokoro-v1.0.onnx').exists()
    assert not (folder / 'voices-v1.0.bin').exists()
    assert (folder / 'personal.wav').exists()


def test_delete_rejects_unknown_model(tmp_path, monkeypatch):
    monkeypatch.setattr(catalog, 'hf_cache', lambda: tmp_path)
    try:
        catalog.delete_downloaded_model('qwen-torch', '../../other')
    except ValueError:
        pass
    else:
        raise AssertionError('Unknown model was allowed to delete files')


def test_delete_models_endpoint_rejects_unknown_and_active_jobs(client):
    assert client.post('/api/models/delete', json={'engine': 'kokoro', 'model': '../../bad'}).status_code == 422

    # A running generation holds the same lock, so deletion must fail with 409.
    assert client.module.engine_lock.acquire(blocking=False)
    try:
        result = client.post('/api/models/delete', json={
            'engine': 'qwen-torch', 'model': 'Qwen/Qwen3-TTS-12Hz-0.6B-Base'})
        assert result.status_code == 409
    finally:
        client.module.engine_lock.release()


def test_builtin_voice_catalog_has_named_british_and_american_presets():
    assert len(catalog.PRESET_VOICES['kokoro']) == 54
    for engine, voices in catalog.PRESET_VOICES.items():
        assert 'preset' in catalog.ENGINES[engine]['roles']
        assert all(voice in catalog.ENGINES[engine]['models'] for voice in voices)
        assert all(name and ' · ' in accent for name, accent in voices.values())


def test_all_kokoro_voice_languages_and_model_sharing():
    from collections import Counter
    voices = catalog.PRESET_VOICES['kokoro']
    assert len(voices) == 54
    assert len(set(voices)) == 54
    expected = {
        'American English': 20, 'British English': 8, 'Japanese': 5,
        'Mandarin Chinese': 8, 'Spanish': 3, 'French': 1,
        'Hindi': 4, 'Italian': 2, 'Brazilian Portuguese': 3,
    }
    assert Counter(accent.split(' · ')[0] for _, accent in voices.values()) == expected
    for voice in voices:
        catalog.validate('preset', 'kokoro', voice)


def test_kokoro_engine_uses_correct_language_phonemization(monkeypatch, tmp_path):
    import sys
    import types
    import numpy as np
    import soundfile as sf
    from backend.kokoro_engine import KokoroEngine

    recorded = []
    class Model:
        def create(self, text, voice, **kwargs):
            recorded.append((text, voice, kwargs))
            return np.zeros(2400, dtype='float32'), 24000
    engine = KokoroEngine()
    engine.model = Model()
    for voice, lang in [('af_heart', 'en-us'), ('bf_emma', 'en-gb'),
                        ('ef_dora', 'es'), ('ff_siwis', 'fr-fr'),
                        ('hf_alpha', 'hi'), ('if_sara', 'it'), ('pf_dora', 'pt-br')]:
        engine.synthesize('A short line.', voice, tmp_path / (voice + '.wav'))
        assert recorded[-1][2]['lang'] == lang

    # The Japanese and Mandarin converters produce phonemes, not English G2P.
    pkg = types.ModuleType('misaki')
    japanese = types.ModuleType('misaki.ja')
    chinese = types.ModuleType('misaki.zh')
    japanese.JAG2P = lambda: lambda text: ('japanese phonemes', None)
    chinese.ZHG2P = lambda: lambda text: ('mandarin phonemes', None)
    monkeypatch.setitem(sys.modules, 'misaki', pkg)
    monkeypatch.setitem(sys.modules, 'misaki.ja', japanese)
    monkeypatch.setitem(sys.modules, 'misaki.zh', chinese)
    for voice, phonemes in [('jf_alpha', 'japanese phonemes'), ('zf_xiaobei', 'mandarin phonemes')]:
        engine.synthesize('A short line.', voice, tmp_path / (voice + '.wav'))
        assert recorded[-1][0] == phonemes
        assert recorded[-1][2]['is_phonemes'] is True


def test_first_run_setup_persists_across_visits(client):  # noqa: F811
    """The desktop wizard remains dismissed after app updates and restarts."""
    initial = client.get('/api/setup')
    assert initial.status_code == 200
    assert initial.json()['finished'] is False
    assert client.put('/api/setup', json={'finished': True}).status_code == 200
    assert client.get('/api/setup').json()['finished'] is True
    assert (client.module.DATA / 'first-run-setup.json').is_file()
    assert client.put('/api/setup', json={'finished': False}).status_code == 200
    assert client.get('/api/setup').json()['finished'] is False


def test_mac_cloning_offers_1_7b_base():
    models = catalog.ENGINES['qwen-mlx']['models']
    assert 'mlx-community/Qwen3-TTS-12Hz-1.7B-Base-8bit' in models
    assert all('clone' in models[m]['roles'] for m in models if '-Base-' in m)


def test_setup_hardware_reports_gpu_memory_and_ffmpeg(client, monkeypatch):
    from backend import hardware
    monkeypatch.setattr(hardware, 'nvidia_gpu', lambda: {'name': 'NVIDIA GeForce RTX 4070', 'memory_gb': 12.0})
    result = client.get('/api/setup/hardware').json()
    assert result['nvidia']['memory_gb'] == 12.0
    assert {'os', 'apple_silicon', 'memory_gb', 'ffmpeg', 'ffmpeg_installable'} <= result.keys()


def test_ffmpeg_install_needs_a_package_manager(client, monkeypatch):
    from backend import media_tools
    monkeypatch.setattr(media_tools, 'install_command', lambda: None)
    assert client.post('/api/setup/ffmpeg').status_code == 501
