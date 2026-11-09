from backend.voice_seed import clone_identity, design_identity, seed_for


def test_seed_is_stable_and_depends_on_voice_and_text(tmp_path):
    ref = tmp_path / 'r.wav'; ref.write_bytes(b'abc')
    other = tmp_path / 'o.wav'; other.write_bytes(b'abd')
    a = clone_identity(ref, 'hi there')
    assert seed_for(a, 'Hello  world') == seed_for(a, 'Hello world')
    assert seed_for(a, 'Hello world') != seed_for(a, 'Hello world!')
    assert seed_for(a, 'x') != seed_for(clone_identity(other, 'hi there'), 'x')
    assert seed_for(a, 'x') != seed_for(clone_identity(ref, 'other'), 'x')
    assert 0 <= seed_for(design_identity('warm  voice'), 'x') < 2**32
    assert design_identity('warm  voice') == design_identity('warm voice')
