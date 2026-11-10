"""Character versions of a voice: the same voice with an accent or a performance.

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

# Kokoro voices that speak English with a real accent: each language's own
# pronunciation rules are applied to the English text.
KOKORO_ACCENTS = {
    'American': {'female': ['af_heart', 'af_bella', 'af_nicole'], 'male': ['am_michael', 'am_adam', 'am_eric']},
    'British (RP)': {'female': ['bf_emma', 'bf_isabella', 'bf_alice'], 'male': ['bm_george', 'bm_fable', 'bm_lewis']},
    # Kokoro has no male French voice; male French characters are designed instead.
    'French': {'female': ['ff_siwis'], 'male': []},
    'Italian': {'female': ['if_sara'], 'male': ['im_nicola']},
    'Spanish': {'female': ['ef_dora'], 'male': ['em_alex', 'em_santa']},
    'Indian': {'female': ['hf_alpha', 'hf_beta'], 'male': ['hm_omega', 'hm_psi']},
    'Brazilian Portuguese': {'female': ['pf_dora'], 'male': ['pm_alex', 'pm_santa']},
}

# Accents Kokoro has no voice for: the voice designer performs them from a description.
DESIGNED_ACCENTS = {
    'Southern American': 'from rural Georgia, with a strong Southern drawl: stretched, gliding vowels and an easy, unhurried rhythm',
    'New York': 'from Brooklyn, New York, with a thick New York accent: dropped r sounds, "cawfee" vowels, fast and punchy',
    'London Cockney': 'from the East End of London, with a broad Cockney accent: dropped h sounds and glottal stops',
    'Scottish': 'from Glasgow, Scotland, with a thick, broad Scottish accent: strongly rolled r sounds and short clipped vowels',
    'Irish': 'from County Cork, Ireland, with a strong lilting Irish brogue and musical rising intonation',
    'Welsh': 'from the Welsh valleys, with a strong sing-song Welsh accent',
    'Australian': 'from Queensland, Australia, with a broad Australian accent: wide vowels and rising endings',
    'South African': 'from Johannesburg, South Africa, with a strong South African accent: clipped vowels',
    'German': 'from Berlin, Germany, speaking English with a heavy German accent: "v" for "w", "z" for "th"',
    'Russian': 'from Moscow, Russia, speaking English with a heavy Russian accent: rolled r and hard consonants',
    'Jamaican': 'from Kingston, Jamaica, with a strong Jamaican accent, rhythmic and musical',
}

KEEP = 'Keep the original'
NAMES = ['Narrator', 'Wizard', 'Villain', 'Hero', 'Pirate', 'Child', 'Soldier', 'Ghost', 'Sidekick', 'Robot',
         'Announcer', 'King', 'Queen', 'Grandparent', 'Detective', 'Monster', 'Fairy', 'Knight']
TARGET_TEXT = ('The morning was cold and grey, and the village had not yet woken. I walked along the river, '
               'listening to the water, and thought about everything that had happened in the last year.')


def accents():
    return ([{'name': KEEP, 'kind': 'keep'}]
            + [{'name': n, 'kind': 'real'} for n in KOKORO_ACCENTS]
            + [{'name': n, 'kind': 'designed'} for n in DESIGNED_ACCENTS])


def performer(accent: str, direction: str, gender: str, take: int) -> str | None:
    """The Kokoro voice for this take, or None when the voice designer must perform it."""
    if direction.strip() or accent not in KOKORO_ACCENTS:
        return None
    by_gender = KOKORO_ACCENTS[accent]
    if gender in by_gender:
        voices = by_gender[gender]
    else:  # No gender chosen: any real speaker of the accent will do.
        voices = by_gender['male'] or by_gender['female']
    # Never perform with the opposite gender: the converter keeps the
    # performer's pitch contour, so a woman's take sounds wrong as a man.
    if not voices:
        return None
    return voices[take % len(voices)]


def description(accent: str, direction: str, gender: str) -> str:
    person = {'female': 'A woman', 'male': 'A man'}.get(gender, 'A person')
    place = DESIGNED_ACCENTS.get(accent) or (f'speaking English with a strong {accent} accent'
                                             if accent and accent != KEEP else '')
    parts = [f'{person} {place}.' if place else f'{person} with a clear speaking voice.']
    if place:
        parts.append(f'The {accent} accent is strong and clearly audible on every word.')
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

    def create(self, *, source_key, name, accent, direction, text, gender, take_path: Path, performer_voice) -> dict:
        character = {'id': uuid4().hex, 'source_key': source_key, 'name': name, 'accent': accent,
                     'direction': direction, 'text': text, 'gender': gender, 'performer': performer_voice,
                     'created': time.time()}
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
