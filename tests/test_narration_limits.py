import pytest
from pydantic import ValidationError

from backend.app import MultiNarrationRequest


def block(text='Hello there.'):
    return {'text': text, 'voice_key': 'kokoro:af_heart'}


def test_narration_accepts_more_than_80_sections():
    assert len(MultiNarrationRequest(blocks=[block()] * 120).blocks) == 120


def test_narration_accepts_maximum_500_sections():
    assert len(MultiNarrationRequest(blocks=[block()] * 500).blocks) == 500


def test_narration_rejects_501_sections():
    with pytest.raises(ValidationError):
        MultiNarrationRequest(blocks=[block()] * 501)


def test_section_text_limit_stays_10000():
    MultiNarrationRequest(blocks=[block('a' * 10000)])
    with pytest.raises(ValidationError):
        MultiNarrationRequest(blocks=[block('a' * 10001)])
