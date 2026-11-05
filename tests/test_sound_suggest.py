"""Local AI suggestions must never invent library IDs."""
from backend.sound_suggest import keyword_suggestions,recommend


LIBRARY=[
    {'id':'a'*32,'name':'Thunder Clap','category':'Weather'},
    {'id':'b'*32,'name':'Ocean Surf','category':'Nature'},
    {'id':'c'*32,'name':'Door Creak','category':'Other'},
]


def test_keyword_suggestions_use_existing_sounds_only():
    found=keyword_suggestions('A storm came over the ocean. The door creaked.',LIBRARY)
    assert {item['sound_id'] for item in found}=={'a'*32,'b'*32,'c'*32}
    assert all(item['source']=='keywords' for item in found)


def test_unknown_script_produces_no_suggestions():
    assert keyword_suggestions('A completely ordinary sentence.',LIBRARY)==[]


def test_fallback_when_local_model_unavailable(monkeypatch):
    monkeypatch.setattr('backend.sound_suggest.ollama_suggestions',lambda *args,**kwargs:None)
    result=recommend('Thunder rolled.',LIBRARY)
    assert result['source']=='keywords'
    assert result['suggestions'][0]['sound_id']=='a'*32


def test_ai_results_are_distinguished_from_keyword_fallback(monkeypatch):
    monkeypatch.setattr('backend.sound_suggest.ollama_suggestions',
                        lambda *args,**kwargs:[{'sound_id':'b'*32,'reason':'Sea','source':'ollama'}])
    result=recommend('A ship crossed the sea.',LIBRARY)
    assert result['source']=='ollama'
    assert result['suggestions'][0]['sound_id']=='b'*32
