"""Favorite and recently used narrators for the Narration Studio picker."""
from __future__ import annotations

import json
from pathlib import Path

RECENT_LIMIT = 8


class VoicePicker:
    def __init__(self, path: Path):
        self.path = path

    def load(self) -> dict:
        try:
            data = json.loads(self.path.read_text())
        except (OSError, ValueError):
            data = {}
        clean = lambda items: [k for k in items if isinstance(k, str)] if isinstance(items, list) else []
        return {'favorites': clean(data.get('favorites')), 'recent': clean(data.get('recent'))[:RECENT_LIMIT]}

    def _save(self, data: dict) -> dict:
        self.path.parent.mkdir(parents=True, exist_ok=True)
        temp = self.path.with_suffix('.tmp')
        temp.write_text(json.dumps(data, indent=2))
        temp.replace(self.path)
        return data

    def favorite(self, key: str, on: bool) -> dict:
        data = self.load()
        favorites = [k for k in data['favorites'] if k != key]
        data['favorites'] = [key, *favorites] if on else favorites
        return self._save(data)

    def used(self, key: str) -> dict:
        data = self.load()
        data['recent'] = [key, *[k for k in data['recent'] if k != key]][:RECENT_LIMIT]
        return self._save(data)
