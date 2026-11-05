"""Local sound effects library: normalized audio assets and safe catalog operations."""
from __future__ import annotations

from datetime import datetime, timezone
from pathlib import Path
from uuid import uuid4
import json
import subprocess
from threading import Lock

import numpy as np
import soundfile as sf
from uuid import uuid5, NAMESPACE_URL

ALLOWED={'.wav','.mp3','.flac','.ogg','.m4a','.aac','.webm'}
MAX_BYTES=30*1024*1024
MAX_EFFECT_SECONDS=600.0

def imported_sound_metadata(filename:str):
    """Provide readable titles and categories for imported sound files."""
    stem=Path(filename).stem.replace('_','-')
    tokens=stem.split('-')
    if tokens and tokens[-1].isdigit() and len(tokens[-1])>=4:
        tokens=tokens[:-1]
    if len(tokens)>=2 and tokens[0].lower()=='dragon' and tokens[1].lower()=='studio':
        tokens=tokens[2:]
    tokens=[word for word in tokens if word]
    name=' '.join(tokens).strip().title() or 'Imported Sound'
    lower=name.lower()
    for category,words in [
        ('Rain',('rain','drizzle','downpour','rainstorm')),
        ('Wind',('wind','breeze')),
        ('Water',('ocean','waves','underwater','river','stream','water')),
        ('Wildlife',('horse','animal','wildlife')),
        ('Nature',('fireplace','campfire','fire crackle','fire')),
        ('Birds',('bird','owl')),
        ('Insects',('cricket','cicada','bee'))
    ]:
        if any(word in lower for word in words):
            return name,category
    return name,'Other'

class SoundEffects:
    def __init__(self,data:Path):
        self.folder=data/'sound_effects'
        self.folder.mkdir(parents=True,exist_ok=True)
        self.catalog=self.folder/'catalog.json'
        self.starter_marker=self.folder/'.starter-nature-v1-installed'
        self.cleanup_marker=self.folder/'.synthetic-nature-v1-removed'
        self.seed_lock=Lock()

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

    def _ensure_starters(self):
        """Remove the defective v1 synthetic pack once, without touching uploads.

        We deliberately do not install synthesized sounds as replacements.
        Legacy v1 IDs are deterministic and owned by Humperdinck; only those
        exact IDs with origin='starter' are eligible for cleanup.
        """
        if self.cleanup_marker.exists():
            return
        with self.seed_lock:
            if self.cleanup_marker.exists():
                return
            entries=self._load()
            changed=False
            for seed in range(1,31):
                identifier=uuid5(NAMESPACE_URL,'humperdinck:original-nature-v1:'+str(seed)).hex
                entry=entries.get(identifier)
                if not entry or entry.get('origin')!='starter':
                    continue
                (self.folder/(identifier+'.wav')).unlink(missing_ok=True)
                del entries[identifier]
                changed=True
            if changed:
                self._write(entries)
            self.cleanup_marker.write_text('Retired synthetic nature starter pack v1\n')

    @staticmethod
    def _waveform(path,parts=56):
        data,_=sf.read(str(path),dtype='float32',always_2d=False)
        if data.ndim>1:data=np.mean(data,axis=1)
        chunks=np.array_split(data,parts)
        peaks=[float(np.sqrt(np.mean(np.square(chunk)))) if len(chunk) else 0 for chunk in chunks]
        highest=max(peaks) if peaks else 0
        return [round(0.07+0.93*min(1.0,v/(highest+1e-8)),3) for v in peaks]

    def list(self):
        self._ensure_starters()
        catalog=self._load()
        changed=False
        for entry in catalog.values():
            path=self.folder/(entry['id']+'.wav')
            if path.exists() and not entry.get('waveform'):
                try:
                    entry['waveform']=self._waveform(path)
                    changed=True
                except (OSError,ValueError):pass
        if changed:self._write(catalog)
        return sorted(
            (entry for entry in catalog.values()
             if (self.folder/(entry['id']+'.wav')).is_file()),
            key=lambda x:(not x.get('favorite',False), x.get('origin')!='starter',
                          x.get('name','').casefold())
        )

    def get_path(self,effect_id:str)->Path:
        self._ensure_starters()
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
                raise ValueError('Sound effects must be between 0 and 600 seconds')
            info={
                'id':effect_id,'name':imported_sound_metadata(filename)[0][:120],
                'category':imported_sound_metadata(filename)[1],'duration':round(duration,2),
                'created_at':datetime.now(timezone.utc).isoformat(),
                'origin':'imported','favorite':False,'waveform':self._waveform(destination),
            }
            catalog=self._load();catalog[effect_id]=info;self._write(catalog)
            return info
        except (subprocess.CalledProcessError,subprocess.TimeoutExpired) as exc:
            raise ValueError('Could not decode sound effect audio') from exc
        finally:
            source.unlink(missing_ok=True)
            if effect_id not in self._load():destination.unlink(missing_ok=True)

    def update(self,effect_id:str,name:str|None,category:str|None,favorite:bool|None=None):
        self.get_path(effect_id)
        catalog=self._load();entry=catalog[effect_id]
        if name is not None:
            if not name.strip():raise ValueError('Name must not be empty')
            entry['name']=name.strip()[:120]
        if category is not None:entry['category']=category.strip()[:60] or 'Other'
        if favorite is not None:entry['favorite']=favorite
        self._write(catalog)
        return entry

    def delete(self,effect_id:str):
        self.get_path(effect_id)
        catalog=self._load();catalog.pop(effect_id,None);self._write(catalog)
        (self.folder/(effect_id+'.wav')).unlink(missing_ok=True)
        return {'deleted':True}
,'',stem)
    if clean.lower().startswith('dragon-studio-'):
        clean=clean[len('dragon-studio-'):]
    clean=re.sub(r'[-_]+',' ',clean).strip()
    clean=re.sub(r'\\b(\\d+\\s*(?:min|minutes|seconds|sec))\\b','',clean,flags=re.I).strip()
    clean=re.sub(r'\\s+',' ',clean).strip()
    title=clean.title() or 'Imported sound'
    lower=clean.lower()
    for category,words in [
        ('Rain',('rain','drizzle','downpour','rainstorm')),
        ('Wind',('wind','breeze')),
        ('Water',('ocean','waves','underwater','river','stream','water')),
        ('Wildlife',('horse','animal','wildlife')),
        ('Nature',('fireplace','campfire','fire crackle','fire')),
        ('Birds',('bird','owl')),
        ('Insects',('cricket','cicada','bee')),
    ]:
        if any(word in lower for word in words):
            return title,category
    return title,'Other'


class SoundEffects:
    def __init__(self,data:Path):
        self.folder=data/'sound_effects'
        self.folder.mkdir(parents=True,exist_ok=True)
        self.catalog=self.folder/'catalog.json'
        self.starter_marker=self.folder/'.starter-nature-v1-installed'
        self.cleanup_marker=self.folder/'.synthetic-nature-v1-removed'
        self.seed_lock=Lock()

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

    def _ensure_starters(self):
        """Remove the defective v1 synthetic pack once, without touching uploads.

        We deliberately do not install synthesized sounds as replacements.
        Legacy v1 IDs are deterministic and owned by Humperdinck; only those
        exact IDs with origin='starter' are eligible for cleanup.
        """
        if self.cleanup_marker.exists():
            return
        with self.seed_lock:
            if self.cleanup_marker.exists():
                return
            entries=self._load()
            changed=False
            for seed in range(1,31):
                identifier=uuid5(NAMESPACE_URL,'humperdinck:original-nature-v1:'+str(seed)).hex
                entry=entries.get(identifier)
                if not entry or entry.get('origin')!='starter':
                    continue
                (self.folder/(identifier+'.wav')).unlink(missing_ok=True)
                del entries[identifier]
                changed=True
            if changed:
                self._write(entries)
            self.cleanup_marker.write_text('Retired synthetic nature starter pack v1\n')

    @staticmethod
    def _waveform(path,parts=56):
        data,_=sf.read(str(path),dtype='float32',always_2d=False)
        if data.ndim>1:data=np.mean(data,axis=1)
        chunks=np.array_split(data,parts)
        peaks=[float(np.sqrt(np.mean(np.square(chunk)))) if len(chunk) else 0 for chunk in chunks]
        highest=max(peaks) if peaks else 0
        return [round(0.07+0.93*min(1.0,v/(highest+1e-8)),3) for v in peaks]

    def list(self):
        self._ensure_starters()
        catalog=self._load()
        changed=False
        for entry in catalog.values():
            path=self.folder/(entry['id']+'.wav')
            if path.exists() and not entry.get('waveform'):
                try:
                    entry['waveform']=self._waveform(path)
                    changed=True
                except (OSError,ValueError):pass
        if changed:self._write(catalog)
        return sorted(
            (entry for entry in catalog.values()
             if (self.folder/(entry['id']+'.wav')).is_file()),
            key=lambda x:(not x.get('favorite',False), x.get('origin')!='starter',
                          x.get('name','').casefold())
        )

    def get_path(self,effect_id:str)->Path:
        self._ensure_starters()
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
                raise ValueError('Sound effects must be between 0 and 600 seconds')
            info={
                'id':effect_id,'name':Path(filename).stem[:120] or 'Sound effect',
                'category':'Other','duration':round(duration,2),
                'created_at':datetime.now(timezone.utc).isoformat(),
                'origin':'imported','favorite':False,'waveform':self._waveform(destination),
            }
            catalog=self._load();catalog[effect_id]=info;self._write(catalog)
            return info
        except (subprocess.CalledProcessError,subprocess.TimeoutExpired) as exc:
            raise ValueError('Could not decode sound effect audio') from exc
        finally:
            source.unlink(missing_ok=True)
            if effect_id not in self._load():destination.unlink(missing_ok=True)

    def update(self,effect_id:str,name:str|None,category:str|None,favorite:bool|None=None):
        self.get_path(effect_id)
        catalog=self._load();entry=catalog[effect_id]
        if name is not None:
            if not name.strip():raise ValueError('Name must not be empty')
            entry['name']=name.strip()[:120]
        if category is not None:entry['category']=category.strip()[:60] or 'Other'
        if favorite is not None:entry['favorite']=favorite
        self._write(catalog)
        return entry

    def delete(self,effect_id:str):
        self.get_path(effect_id)
        catalog=self._load();catalog.pop(effect_id,None);self._write(catalog)
        (self.folder/(effect_id+'.wav')).unlink(missing_ok=True)
        return {'deleted':True}
