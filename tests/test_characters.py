from backend import characters as ch


def test_accents_are_retired():
    assert ch.accents() == [{'name': ch.KEEP, 'kind': 'keep'}]
    assert ch.performer('French', '', 'female', 0) is None
    assert not hasattr(ch, 'DESIGNED_ACCENTS') and not hasattr(ch, 'KOKORO_ACCENTS')


def test_description_is_direction_only():
    assert ch.description('Scottish', 'slow and gravelly', 'male') == 'A man with a clear speaking voice. Delivery: slow and gravelly'
    assert ch.description(ch.KEEP, '', 'female') == 'A woman with a clear speaking voice.'


def test_impression_targets_same_language_other_gender_first():
    from backend import catalog
    voices = catalog.PRESET_VOICES['kokoro']
    targets = ch.impression_targets('bm_george', voices)
    assert targets and all(t['voice'][0] == 'b' and t['voice'] != 'bm_george' for t in targets)
    genders = [t['gender'] for t in targets]
    assert genders == sorted(genders, key=lambda g: g != 'female')  # women first for George
    assert 'bf_emma' in {t['voice'] for t in targets}
    assert ch.impression_targets('af_heart', voices)[0]['gender'] == 'male'
    assert ch.impression_targets('nope', voices) == []
    assert ch.impression_targets('bm_george', voices, downloaded=lambda v: v == 'bf_emma') == \
        [{'voice': 'bf_emma', 'name': 'Emma', 'gender': 'female', 'group': 'A woman'}]
    assert len(ch.IMPRESSION_WEIGHTS) == len(ch.IMPRESSION_STRENGTHS) == 3
    assert all(0 < w <= ch.IMPRESSION_MAX for w in ch.IMPRESSION_WEIGHTS)


def test_create_list_rename_delete(tmp_path):
    store = ch.Characters(tmp_path / 'characters')
    take = tmp_path / 'take.wav'
    take.write_bytes(b'RIFF')
    made = store.create(source_key='preset:kokoro:bm_fable', name='Wizard', accent='French', direction='',
                        text='Hello', gender='male', take_path=take, performer_voice='ff_siwis')
    assert store.audio(made['id']).read_bytes() == b'RIFF'
    assert [c['name'] for c in store.list()] == ['Wizard']
    assert store.update(made['id'], name='Old wizard')['name'] == 'Old wizard'
    assert store.get('../etc') is None
    assert store.delete(made['id']) and store.list() == [] and not store.audio(made['id']).exists()


def test_impression_is_saved_with_the_character(tmp_path):
    store = ch.Characters(tmp_path / 'characters')
    take = tmp_path / 'take.wav'
    take.write_bytes(b'RIFF')
    made = store.create(source_key='preset:kokoro:bm_george', name='Queen', accent='', direction='',
                        text='Hello', gender='male', take_path=take, performer_voice=None,
                        impression={'voice': 'bf_emma', 'weight': 0.35})
    assert store.get(made['id'])['impression'] == {'voice': 'bf_emma', 'weight': 0.35}


def test_impression_takes_save_and_narrate_without_converter_or_clone(tmp_path, monkeypatch):
    import numpy as np
    import soundfile as sf
    from types import SimpleNamespace
    from backend import app as api

    (tmp_path / 'outputs').mkdir()
    store = ch.Characters(tmp_path / 'characters')
    monkeypatch.setattr(api, 'DATA', tmp_path)
    monkeypatch.setattr(api, 'characters', store)
    monkeypatch.setattr(api, 'jobs', {})
    monkeypatch.setattr(api, 'require_voice_selection', lambda key: None)
    monkeypatch.setattr(api.catalog, 'downloaded', lambda v: True)
    monkeypatch.setattr(api.engines, 'installed', lambda e: e == 'kokoro')
    monkeypatch.setattr(api, 'require_converter', lambda: (_ for _ in ()).throw(AssertionError('converter')))
    monkeypatch.setattr(api.engines, 'clone', lambda *a, **k: (_ for _ in ()).throw(AssertionError('clone')))
    monkeypatch.setattr(api, 'settings', SimpleNamespace(load=lambda: {'clone': {'engine': 'x'}, 'design': {'engine': 'x'}}))
    calls = []

    def preset(engine, voice, output, text, on_progress=None, speed=1.0, blend=None):
        calls.append((voice, blend, speed))
        sf.write(output, np.full(240, 0.1, dtype=np.float32), 24_000)

    monkeypatch.setattr(api.engines, 'preset', preset)

    class Inline:
        def __init__(self, target, args, daemon): self.target, self.args = target, args
        def start(self): self.target(*self.args)
    monkeypatch.setattr(api, 'Thread', Inline)

    options = api.character_options('preset:kokoro:bm_george')
    assert 'bf_emma' in {t['voice'] for t in options['impressions']}
    upload = api.character_options('upload:abc')['impressions']
    assert upload and all(t['voice'] != 'upload:abc' for t in upload)
    assert api.character_options('preset:piper:x')['impressions'] == []

    job = api.create_character_takes(api.CharacterTakesInput(
        source_key='preset:kokoro:bm_george', impression='bf_emma', text='Hello darling.'))
    assert job['status'] == 'complete', job['message']
    assert [c[1]['weight'] for c in calls] == list(ch.IMPRESSION_WEIGHTS)
    assert [t['label'] for t in job['takes']] == ['Subtle', 'Medium', 'Strong']

    saved = api.save_character(api.CharacterInput(
        source_key='preset:kokoro:bm_george', name='Queen', job_id=job['job_id'], take=1))
    assert saved['impression'] == {'voice': 'bf_emma', 'weight': 0.35}

    calls.clear()
    key = 'character:' + saved['id']
    request = api.MultiNarrationRequest(blocks=[{'text': 'Tea, darling?', 'voice_key': key, 'speed': 1.1}], format='wav')
    api.jobs['n' * 32] = {'status': 'queued', 'progress': 0}
    api.run_multi('n' * 32, request, [api.resolve_voice_key(key)])
    assert api.jobs['n' * 32]['status'] == 'complete', api.jobs['n' * 32]['message']
    assert calls == [('bm_george', {'voice': 'bf_emma', 'weight': 0.35}, 1.1)]


def test_impression_rejects_other_languages_and_non_kokoro_sources(monkeypatch):
    import pytest
    from fastapi import HTTPException
    from backend import app as api
    monkeypatch.setattr(api, 'require_voice_selection', lambda key: None)
    monkeypatch.setattr(api.catalog, 'downloaded', lambda v: True)
    for source, target in (('preset:kokoro:bm_george', 'af_heart'), ('upload:abc', 'bf_emma')):
        with pytest.raises(HTTPException) as err:
            api.create_character_takes(api.CharacterTakesInput(source_key=source, impression=target, text='Hi'))
        assert err.value.status_code == 422


def test_mix_slider_makes_three_takes_around_the_chosen_strength():
    assert ch.impression_weights(None) == (list(ch.IMPRESSION_WEIGHTS), list(ch.IMPRESSION_STRENGTHS))
    assert ch.impression_weights(0.5) == ([0.4, 0.5, 0.6], ['40% mix', '50% mix', '60% mix'])
    # Clamped at both ends; duplicates collapse instead of rendering the same take twice.
    assert ch.impression_weights(0.8)[0] == [0.7, 0.8]
    assert ch.impression_weights(0.1)[0] == [0.1, 0.2]
    assert ch.impression_weights(5)[0] == [0.7, 0.8]
