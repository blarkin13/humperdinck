from backend.voice_picker import VoicePicker, RECENT_LIMIT


def test_favorites_and_recent(tmp_path):
    picker = VoicePicker(tmp_path / 'picker.json')
    assert picker.load() == {'favorites': [], 'recent': []}
    picker.favorite('preset:kokoro:af_heart', True)
    picker.favorite('design:abc', True)
    assert picker.load()['favorites'] == ['design:abc', 'preset:kokoro:af_heart']
    picker.favorite('design:abc', False)
    assert picker.load()['favorites'] == ['preset:kokoro:af_heart']
    for i in range(RECENT_LIMIT + 3):
        picker.used(f'upload:{i}')
    picker.used('upload:5')
    recent = picker.load()['recent']
    assert recent[0] == 'upload:5' and len(recent) == RECENT_LIMIT and recent.count('upload:5') == 1


def test_corrupt_file_is_empty(tmp_path):
    path = tmp_path / 'picker.json'
    path.write_text('{nope')
    assert VoicePicker(path).load() == {'favorites': [], 'recent': []}
