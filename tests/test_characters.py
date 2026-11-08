from backend import characters as ch


def test_performer_uses_kokoro_only_for_real_accents_without_direction():
    assert ch.performer('French', '', 'female', 0) == 'ff_siwis'
    assert ch.performer('Spanish', '', 'male', 1) == 'em_santa'
    assert ch.performer('Spanish', '', 'male', 2) == 'em_alex'  # takes cycle through voices
    assert ch.performer('French', 'whispering', 'female', 0) is None
    assert ch.performer('Scottish', '', 'male', 0) is None
    assert ch.performer(ch.KEEP, '', 'male', 0) is None


def test_description_leads_with_accent_and_adds_direction():
    text = ch.description('Scottish', 'slow and gravelly', 'male')
    assert text.startswith('A man from Glasgow') and 'Delivery: slow and gravelly' in text
    assert ch.description(ch.KEEP, '', 'female') == 'A woman with a clear speaking voice.'


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


def test_accent_kinds():
    kinds = {a['name']: a['kind'] for a in ch.accents()}
    assert kinds['French'] == 'real' and kinds['Scottish'] == 'designed' and kinds[ch.KEEP] == 'keep'
