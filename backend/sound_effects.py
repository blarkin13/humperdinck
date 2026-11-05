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
MAX_BYTES=65*1024*1024
MAX_EFFECT_SECONDS=600.0


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
        if not raw or len(raw)>MAX_BYTES:raise ValueError('Sound effects must be under 65 MB')
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

    def import_curated(self,entry,raw:bytes,filename:str):
        """Use existing audio decoder; do not install a link as a playable asset."""
        existing=next((v for v in self._load().values() if v.get('curated_slug')==entry['slug']),None)
        if existing and (self.folder/(existing['id']+'.wav')).is_file():
            return existing
        added=self.add(filename,raw)
        entries=self._load()
        saved=entries[added['id']]
        saved.update({
            'name':entry['name'],'category':entry['category'],
            'curated_slug':entry['slug'],'creator':entry['creator'],
            'source_url':entry['source_url'],'license':'CC0 1.0',
            'origin':'curated-cc0','provider':entry['provider']
        })
        self._write(entries)
        return saved

    def import_pack(self,raw:bytes):
        """Import an authenticated pack of approved curated CC0 recordings.

        File names and slugs are checked against our curated catalog. No ZIP
        extraction, arbitrary paths, or user-supplied license claims.
        """
        from io import BytesIO
        from zipfile import ZipFile, BadZipFile
        from hashlib import sha256
        from backend.curated_sounds import BY_SLUG
        if len(raw)>150*1024*1024:
            raise ValueError('Pack exceeds 150 MB')
        try:
            archive=ZipFile(BytesIO(raw))
        except BadZipFile as exc:
            raise ValueError('Invalid sound pack ZIP') from exc
        with archive:
            if len(archive.infolist())>25:
                raise ValueError('Sound pack contains too many files')
            try:
                manifest=json.loads(archive.read('humperdinck-sounds.json'))
            except (KeyError,ValueError) as exc:
                raise ValueError('Missing or invalid Humperdinck sound pack manifest') from exc
            if manifest.get('version')!=1 or not isinstance(manifest.get('sounds'),list):
                raise ValueError('Unsupported sound pack manifest')
            imported=[];skipped=[];seen=set()
            for item in manifest['sounds']:
                if not isinstance(item,dict):
                    raise ValueError('Invalid sound pack entry')
                slug=item.get('slug')
                filename=item.get('file')
                source=BY_SLUG.get(slug)
                if not source or slug in seen or not isinstance(filename,str):
                    raise ValueError('Unknown or duplicated sound pack entry')
                seen.add(slug)
                if filename.startswith('/') or '\\\\' in filename or '/' in filename or filename.startswith('.'):
                    raise ValueError('Unsafe sound pack file name')
                details=archive.getinfo(filename)
                if details.file_size>MAX_BYTES:
                    raise ValueError('Recording exceeds 65 MB')
                original=archive.read(filename)
                if sha256(original).hexdigest()!=item.get('sha256'):
                    raise ValueError('Sound pack checksum mismatch')
                present=next((v for v in self._load().values()
                              if v.get('curated_slug')==slug and
                              (self.folder/(v['id']+'.wav')).is_file()),None)
                if present:
                    skipped.append(source['name'])
                else:
                    result=self.import_curated(source,original,filename)
                    imported.append(result)
            return {'imported':imported,'skipped':skipped,'count':len(imported)}

    def delete(self,effect_id:str):
        self.get_path(effect_id)
        catalog=self._load();catalog.pop(effect_id,None);self._write(catalog)
        (self.folder/(effect_id+'.wav')).unlink(missing_ok=True)
        return {'deleted':True}
