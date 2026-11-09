"""Pronunciation dictionary: teach every voice how to say a word.

Each entry maps a written word or phrase to how it should be spoken, e.g.
"YOLO" -> "yoh-loh". The swap happens on the text before any engine sees it,
so it works for every voice and engine. Matching is whole-word and ignores
case; longer entries win over shorter ones ("YOLO v8" before "YOLO").
"""
from __future__ import annotations

import json
from pathlib import Path
import re

MAX_ENTRIES = 500
MAX_WORD = 60
MAX_SAY = 120


def _clean(entries) -> list[dict]:
    seen, cleaned = set(), []
    for entry in entries or []:
        word = str(entry.get('word', '')).strip()[:MAX_WORD]
        say = str(entry.get('say', '')).strip()[:MAX_SAY]
        if not word or not say or word.lower() in seen:
            continue
        seen.add(word.lower())
        cleaned.append({'word': word, 'say': say})
    if len(cleaned) > MAX_ENTRIES:
        raise ValueError(f'Keep the pronunciation list to {MAX_ENTRIES} words or fewer')
    return cleaned


class Pronunciations:
    def __init__(self, data: Path):
        self.path = Path(data) / 'pronunciations.json'
        self._cache = None

    def list(self) -> list[dict]:
        if self._cache is None:
            try:
                self._cache = _clean(json.loads(self.path.read_text()).get('entries'))
            except (OSError, ValueError, AttributeError):
                self._cache = []
        return list(self._cache)

    def save(self, entries) -> list[dict]:
        cleaned = _clean(entries)
        tmp = self.path.with_suffix('.tmp')
        tmp.write_text(json.dumps({'entries': cleaned}, indent=2))
        tmp.replace(self.path)
        self._cache = cleaned
        return list(cleaned)

    def apply(self, text: str) -> str:
        return apply(text, self.list())


def apply(text: str, entries: list[dict]) -> str:
    if not entries or not text:
        return text
    ordered = sorted(entries, key=lambda e: len(e['word']), reverse=True)
    lookup = {e['word'].lower(): e['say'] for e in ordered}
    # One pass, so a replacement is never itself replaced again.
    pattern = re.compile(r'(?<!\w)(' + '|'.join(re.escape(e['word']) for e in ordered) + r')(?!\w)', re.IGNORECASE)
    return pattern.sub(lambda m: lookup[m.group(1).lower()], text)
