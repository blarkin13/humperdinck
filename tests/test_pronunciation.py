import pytest
from backend.pronunciation import Pronunciations, apply


def test_whole_words_only_and_case_insensitive():
    entries = [{'word': 'YOLO', 'say': 'yoh-loh'}, {'word': 'epochs', 'say': 'ep-ocks'}]
    assert apply('The yolo model ran 120 Epochs.', entries) == 'The yoh-loh model ran 120 ep-ocks.'
    assert apply('YOLOv8 and yolomodel stay', entries) == 'YOLOv8 and yolomodel stay'


def test_longest_phrase_wins_and_no_double_replacement():
    entries = [{'word': 'SQL', 'say': 'sequel'}, {'word': 'SQL Server', 'say': 'sequel server'},
               {'word': 'sequel', 'say': 'WRONG'}]
    assert apply('SQL Server beats SQL', entries) == 'sequel server beats sequel'


def test_punctuation_in_words():
    assert apply('I use C++ daily.', [{'word': 'C++', 'say': 'C plus plus'}]) == 'I use C plus plus daily.'


def test_store_round_trip_dedupes_and_ignores_blanks(tmp_path):
    store = Pronunciations(tmp_path)
    assert store.list() == []
    saved = store.save([{'word': ' GIF ', 'say': 'jif'}, {'word': 'gif', 'say': 'gif'}, {'word': '', 'say': 'x'}])
    assert saved == [{'word': 'GIF', 'say': 'jif'}]
    assert Pronunciations(tmp_path).apply('A GIF.') == 'A jif.'


def test_limit(tmp_path):
    with pytest.raises(ValueError):
        Pronunciations(tmp_path).save([{'word': f'w{i}', 'say': 'x'} for i in range(501)])
