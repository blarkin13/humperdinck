"""Local sound effects library: normalized audio assets and safe catalog operations."""
from __future__ import annotations

from datetime import datetime, timezone
from pathlib import Path
from uuid import uuid4
import json
import subprocess

import soundfile as sf

ALLOWED={'.wav','.mp3','.flac','.ogg','.m4a','.aac','.webm'}
MAX_BYTES=30*1024*1024
MAX_EFFECT_SECONDS=180.0


class SoundEffects:
    def __init__(self,data:Path):
        self.folder=data/'sound_effects'
        self.folder.mkdir(parents=True,exist_ok=True)
        self.catalog=self.folder/'catalog.json'

    def _load(self):
        if not self.catalog.is_file():return {}
        try:
            doc=json.loads(self.catalog.read_text())
            return doc if isinstance(doc,dict) else {}
        except (ValueError,OSError):
            return {}

    def _write(self,entries):
        temp=self.catalog.with_suffix('.tmp')
        temp.write_text(json.dumps(entries,indent=2))
        temp.replace(self.catalog)

    def list(self):
        return sorted(
            (entry for entry in self._load().values()
             if (self.folder/(entry['id']+'.wav')).is_file()),
            key=lambda x:x.get('created_at',''),reverse=True
        )

    def get_path(self,effect_id:str)->Path:
        if len(effect_id)!=32 or any(c not in '0123456789abcdef' for c in effect_id):
            raise ValueError('Invalid sound effect ID')
        item=self._load().get(effect_id)
        path=self.folder/(effect_id+'.wav')
        if not item or not path.is_file():raise FileNotFoundError('Sound effect not found')
        return path

    def add(self,filename:str,raw:bytes):
        suffix=Path(filename).suffix.lower()
        if suffix not in ALLOWED:raise ValueError('Unsupported sound format')
        if not raw or len(raw)>MAX_BYTES:raise ValueError('Sound effects must be under 30 MB')
        effect_id=uuid4().hex
        source=self.folder/(effect_id+'.upload'+suffix)
        destination=self.folder/(effect_id+'.wav')
        source.write_bytes(raw)
        try:
            subprocess.run(
                ['ffmpeg','-nostdin','-hide_banner','-loglevel','error','-y',
                 '-i',str(source),'-vn','-ac','1','-ar','24000',str(destination)],
                check=True,capture_output=True,timeout=120
            )
            duration=sf.info(str(destination)).duration
            if duration<=0 or duration>MAX_EFFECT_SECONDS:
                raise ValueError('Sound effects must be between 0 and 180 seconds')
            info={
                'id':effect_id,'name':Path(filename).stem[:120] or 'Sound effect',
                'category':'Other','duration':round(duration,2),
                'created_at':datetime.now(timezone.utc).isoformat(),
            }
            catalog=self._load();catalog[effect_id]=info;self._write(catalog)
            return info
        except (subprocess.CalledProcessError,subprocess.TimeoutExpired) as exc:
            raise ValueError('Could not decode sound effect audio') from exc
        finally:
            source.unlink(missing_ok=True)
            if effect_id not in self._load():destination.unlink(missing_ok=True)

    def update(self,effect_id:str,name:str|None,category:str|None):
        self.get_path(effect_id)
        catalog=self._load();entry=catalog[effect_id]
        if name is not None:
            if not name.strip():raise ValueError('Name must not be empty')
            entry['name']=name.strip()[:120]
        if category is not None:entry['category']=category.strip()[:60] or 'Other'
        self._write(catalog)
        return entry

    def delete(self,effect_id:str):
        self.get_path(effect_id)
        catalog=self._load();catalog.pop(effect_id,None);self._write(catalog)
        (self.folder/(effect_id+'.wav')).unlink(missing_ok=True)
        return {'deleted':True}
