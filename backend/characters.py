"""Character versions of a voice: the same voice doing an impression or a performance.

A character belongs to its original voice (``source_key``). Its sound is made in
two steps: a *performance* (a Kokoro voice reading with its own language's
pronunciation, or the voice designer following a written direction) is
re-voiced into the original voice with the OpenVoice converter. The character's
name is only a label.
"""
from __future__ import annotations

import json
import shutil
import time
from pathlib import Path
from uuid import uuid4

# Accents were removed on 2026-11-10: Qwen VoiceDesign ignores accent
# descriptions, and real accented Kokoro speakers stop sounding like the
# original voice once converted. Older saved accent characters still play.

# Impressions: a Kokoro voice "doing" another voice. Its style is blended part of
# the way toward the other voice; each take is one strength.
IMPRESSION_WEIGHTS = (0.2, 0.35, 0.5)
IMPRESSION_STRENGTHS = ('Subtle', 'Medium', 'Strong')


def impression_targets(source_voice: str, preset_voices: dict, downloaded=lambda v: True) -> list[dict]:
    """Kokoro voices this voice can impersonate: same language, other gender first."""
    if source_voice not in preset_voices:
        return []
    language = source_voice[0]
    gender = source_voice[1:2]
    found = [{'voice': v, 'name': label, 'gender': 'female' if v[1] == 'f' else 'male'}
             for v, (label, _) in preset_voices.items()
             if v != source_voice and v[0] == language and downloaded(v)]
    return sorted(found, key=lambda t: (t['voice'][1] == gender, t['name']))


KEEP = 'Keep the original'
NAMES = ['Narrator', 'Wizard', 'Villain', 'Hero', 'Pirate', 'Child', 'Soldier', 'Ghost', 'Sidekick', 'Robot',
         'Announcer', 'King', 'Queen', 'Grandparent', 'Detective', 'Monster', 'Fairy', 'Knight']
TARGET_TEXT = ('The morning was cold and grey, and the village had not yet woken. I walked along the river, '
               'listening to the water, and thought about everything that had happened in the last year.')


def accents():
    return [{'name': KEEP, 'kind': 'keep'}]


def performer(accent: str, direction: str, gender: str, take: int) -> str | None:
    """Kokoro accent performers are retired; new characters never use one."""
    return None


def description(accent: str, direction: str, gender: str) -> str:
    person = {'female': 'A woman', 'male': 'A man'}.get(gender, 'A person')
    parts = [f'{person} with a clear speaking voice.']
    if direction.strip():
        parts.append(f'Delivery: {direction.strip()}')
    return ' '.join(parts)[:1100]


class Characters:
    def __init__(self, folder: Path):
        self.folder = folder
        self.takes = folder / 'takes'
        self.targets = folder / 'targets'
        for path in (self.folder, self.takes, self.targets):
            path.mkdir(parents=True, exist_ok=True)

    def _meta(self, character_id: str) -> Path:
        if not character_id.isalnum():
            raise KeyError(character_id)
        return self.folder / f'{character_id}.json'

    def list(self) -> list[dict]:
        found = []
        for path in self.folder.glob('*.json'):
            try:
                found.append(json.loads(path.read_text()))
            except (OSError, ValueError):
                continue
        return sorted(found, key=lambda c: c.get('created', 0))

    def get(self, character_id: str) -> dict | None:
        try:
            return json.loads(self._meta(character_id).read_text())
        except (KeyError, OSError, ValueError):
            return None

    def audio(self, character_id: str) -> Path:
        return self.folder / f'{character_id}.wav'

    def create(self, *, source_key, name, accent, direction, text, gender, take_path: Path, performer_voice,
               impression=None, summary=None) -> dict:
        character = {'id': uuid4().hex, 'source_key': source_key, 'name': name, 'accent': accent,
                     'direction': direction, 'text': text, 'gender': gender, 'performer': performer_voice,
                     'created': time.time()}
        if impression:
            character['impression'] = impression
            character['summary'] = summary
        shutil.copyfile(take_path, self.audio(character['id']))
        self._write(character)
        return character

    def update(self, character_id: str, **changes) -> dict | None:
        character = self.get(character_id)
        if not character:
            return None
        character.update({k: v for k, v in changes.items() if v is not None})
        self._write(character)
        return character

    def delete(self, character_id: str) -> bool:
        meta = self._meta(character_id)
        if not meta.is_file():
            return False
        meta.unlink()
        self.audio(character_id).unlink(missing_ok=True)
        return True

    def take_path(self, job_id: str, index: int) -> Path:
        return self.takes / f'{job_id}-{index}.wav'

    def prune_takes(self, max_age_s: float = 86400):
        cutoff = time.time() - max_age_s
        for path in self.takes.glob('*.wav'):
            if path.stat().st_mtime < cutoff:
                path.unlink(missing_ok=True)

    def _write(self, character: dict):
        temp = self.folder / f"{character['id']}.tmp"
        temp.write_text(json.dumps(character, indent=2))
        temp.replace(self._meta(character['id']))
