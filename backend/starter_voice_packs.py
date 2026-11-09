"""Explicitly approved, generated-only starter voice samples.

The original audio in data/voices/<id>.wav is NEVER read by the exporter.
Only samples copied after an explicit approval are eligible for the pack.
"""
from __future__ import annotations

from datetime import datetime, timezone
from hashlib import sha256
from io import BytesIO
from pathlib import Path
from uuid import uuid5, NAMESPACE_URL
from zipfile import ZipFile, ZIP_DEFLATED
import json

import soundfile as sf

SENTENCE="The old lighthouse stood quietly above the waves, waiting for the next storm."
PACK_NAME="humperdinck-builtin-voices-v1.zip"
MAX_SAMPLE_BYTES=16*1024*1024
MAX_PACK_BYTES=120*1024*1024
CHANNELS=("builtin","catalog")


def stable_id(identifier:str)->str:
    return uuid5(NAMESPACE_URL,"humperdinck:starter-voice:v1:"+identifier).hex


class StarterVoices:
    def __init__(self,data:Path):
        self.data=Path(data)
        self.folder=self.data/"starter_voice_samples"
        self.folder.mkdir(parents=True,exist_ok=True)
        self.catalog=self.folder/"approved.json"

    def _read(self):
        try:
            document=json.loads(self.catalog.read_text())
            return document if isinstance(document,dict) else {}
        except (OSError,ValueError):
            return {}

    def _write(self,values):
        tmp=self.catalog.with_suffix(".tmp")
        tmp.write_text(json.dumps(values,indent=2))
        tmp.replace(self.catalog)

    def list(self):
        return [{"channel":"builtin",**v} for v in self._read().values() if
                (self.folder/(v["source_voice_id"]+".wav")).is_file()]

    def set_channel(self,source_id:str,channel:str):
        """builtin: every install gets it. catalog: people choose it in the voice gallery."""
        if channel not in CHANNELS:
            raise ValueError("Choose builtin or catalog")
        stored=self._read()
        if source_id not in stored:
            raise ValueError("That voice is not in the built-in pack")
        stored[source_id]["channel"]=channel
        self._write(stored)
        return stored[source_id]

    def set_details(self,source_id:str,name:str|None=None,category:str|None=None):
        """Rename or re-categorize a voice already in the pack; the sample stays the same."""
        stored=self._read()
        if source_id not in stored:
            raise ValueError("That voice is not in the built-in pack")
        if name is not None:
            name=str(name).strip()[:120]
            if not name:
                raise ValueError("Give the voice a name")
            stored[source_id]["name"]=name
        if category is not None:
            stored[source_id]["category"]=str(category).strip()[:60]
        self._write(stored)
        return stored[source_id]

    def catalog_files(self,selected:list[str]):
        """(public entry, sample bytes) for each gallery voice."""
        approvals=self._read()
        for source_id in selected:
            entry=approvals.get(source_id)
            path=self.folder/(source_id+".wav")
            if entry is None or not path.is_file():
                raise ValueError("Every gallery voice must be approved")
            raw=path.read_bytes()
            uid=stable_id(source_id)
            yield {"voice_id":uid,"name":entry["name"],"category":entry["category"],
                   "file":"catalog-"+uid+".wav","sha256":sha256(raw).hexdigest(),
                   "duration":round(sf.info(str(path)).duration,1)},raw

    def approve(self,source_id:str,wav:Path,voice:dict):
        if not source_id.isalnum():
            raise ValueError("Invalid voice identifier")
        wav=Path(wav)
        if not wav.is_file() or wav.stat().st_size>MAX_SAMPLE_BYTES:
            raise ValueError("Approved voice sample is missing or too large")
        detail=sf.info(str(wav))
        if detail.duration<1 or detail.duration>60:
            raise ValueError("Approved sample must be between 1 and 60 seconds")
        if detail.samplerate!=24000 or detail.channels!=1:
            raise ValueError("Sample must be 24 kHz mono WAV")
        destination=self.folder/(source_id+".wav")
        # Atomically persist only the generated output, not the source recording.
        tmp=destination.with_suffix(".tmp")
        tmp.write_bytes(wav.read_bytes())
        tmp.replace(destination)
        metadata={
            "source_voice_id":source_id,
            "name":str(voice.get("name") or "Starter Voice")[:120],
            "category":str(voice.get("category") or "")[:60],
            "refinement":voice.get("refinement") or {},
            "sample_text":SENTENCE,
            "approved_at":datetime.now(timezone.utc).isoformat()
        }
        stored=self._read()
        metadata["channel"]=(stored.get(source_id) or {}).get("channel","builtin")
        stored[source_id]=metadata
        self._write(stored)
        return metadata

    def remove(self,source_id:str):
        """Take a voice out of the pack. The next publish removes it from every install."""
        stored=self._read()
        if source_id not in stored:
            raise ValueError("That voice is not in the built-in pack")
        stored.pop(source_id)
        self._write(stored)
        (self.folder/(source_id+".wav")).unlink(missing_ok=True)

    def export(self,selected:list[str],revision:int=0)->bytes:
        if not selected or len(selected)>30 or len(set(selected))!=len(selected):
            raise ValueError("Select between one and 30 unique approved starter voices")
        approvals=self._read()
        manifest={"format":"humperdinck-starter-voices","version":1,
                  "revision":int(revision),"reference_text":SENTENCE,"voices":[]}
        out=BytesIO()
        with ZipFile(out,"w",ZIP_DEFLATED) as pack:
            for source_id in selected:
                entry=approvals.get(source_id)
                if entry is None:
                    raise ValueError("Every exported voice must be explicitly approved")
                path=self.folder/(source_id+".wav")
                if not path.is_file() or path.stat().st_size>MAX_SAMPLE_BYTES:
                    raise ValueError("Approved sample missing")
                raw=path.read_bytes()
                filename=stable_id(source_id)+".wav"
                pack.writestr("samples/"+filename,raw)
                manifest["voices"].append({
                    "voice_id":stable_id(source_id),
                    "name":entry["name"],"category":entry["category"],
                    "reference_text":SENTENCE,
                    "refinement_description":entry.get("refinement",{}),
                    "sample_file":"samples/"+filename,
                    "sha256":sha256(raw).hexdigest()
                })
            pack.writestr("manifest.json",json.dumps(manifest,indent=2))
        return out.getvalue()


def install(data:Path,raw:bytes):
    """Install the approved generated samples; never touch personal voices.

    A pack with a newer revision than the last one applied also updates
    changed samples and removes built-in voices it no longer lists. Older or
    unrevisioned packs (the copy bundled in the installer) only add voices
    this computer has never seen.
    """
    if len(raw)>MAX_PACK_BYTES:
        raise ValueError("Starter voice pack too large")
    data=Path(data)
    try:
        archive=ZipFile(BytesIO(raw))
    except Exception as exc:
        raise ValueError("Invalid starter voice pack ZIP") from exc
    with archive:
        infos=archive.infolist()
        if len(infos)>31 or any(i.file_size>MAX_SAMPLE_BYTES for i in infos if i.filename!="manifest.json"):
            raise ValueError("Invalid starter voice pack size")
        manifest=json.loads(archive.read("manifest.json"))
        if (manifest.get("format")!="humperdinck-starter-voices" or
            manifest.get("version")!=1 or
            manifest.get("reference_text")!=SENTENCE):
            raise ValueError("Invalid starter voice pack manifest")
        revision=manifest.get("revision",0)
        if not isinstance(revision,int) or revision<0:
            raise ValueError("Invalid starter voice pack revision")
        voices=manifest.get("voices",[])
        if not isinstance(voices,list) or not 1<=len(voices)<=30:
            raise ValueError("Starter voice pack must include 1-30 voices")
        voice_dir=data/"voices"
        voice_dir.mkdir(parents=True,exist_ok=True)
        names_file=voice_dir/"names.json"
        existing=json.loads(names_file.read_text()) if names_file.is_file() else {}
        if not isinstance(existing,dict):
            raise ValueError("Existing voice metadata invalid")
        # Keep a separate record of public IDs that were already delivered,
        # even if a user later deletes their sound file.
        history_file=voice_dir/".builtin_humperdinck_seen.json"
        try:
            historic=json.loads(history_file.read_text()) if history_file.is_file() else []
        except (OSError,ValueError):
            historic=[]
        if not isinstance(historic,list) or any(not isinstance(v,str) for v in historic):
            raise ValueError("Invalid built-in voice history")
        previously_seen=set(historic)
        previously_seen.update(k for k,v in existing.items()
                               if isinstance(v,dict) and v.get("origin")=="builtin-humperdinck")
        revision_file=voice_dir/".builtin_humperdinck_revision"
        try:
            applied=int(revision_file.read_text().strip())
        except (OSError,ValueError):
            applied=0
        newer=revision>applied
        imported=[]
        updated=[]
        seen=set()
        for item in voices:
            uid=item["voice_id"]
            if uid in seen or len(uid)!=32 or any(ch not in "0123456789abcdef" for ch in uid):
                raise ValueError("Invalid or repeated starter voice identifier")
            seen.add(uid)
            filename="samples/"+uid+".wav"
            if item.get("sample_file")!=filename or item.get("reference_text")!=SENTENCE:
                raise ValueError("Starter voice sample path or transcript mismatch")
            audio=archive.read(filename)
            if len(audio)>MAX_SAMPLE_BYTES or sha256(audio).hexdigest()!=item.get("sha256"):
                raise ValueError("Starter voice sample checksum mismatch")
            # Check the soundfile header before installing.
            info=sf.info(BytesIO(audio))
            if info.samplerate!=24000 or info.channels!=1 or not 1<=info.duration<=60:
                raise ValueError("Starter voice audio must be 24 kHz mono and 1-60s")
            path=voice_dir/(uid+".wav")
            ours=isinstance(existing.get(uid),dict) and existing[uid].get("origin")=="builtin-humperdinck"
            if newer and ours and path.is_file():
                # A newer published pack replaces the sample and name of a built-in voice.
                if path.read_bytes()!=audio:
                    tmp=path.with_suffix(".tmp")
                    tmp.write_bytes(audio)
                    tmp.replace(path)
                    updated.append(uid)
                existing[uid].update(name=str(item.get("name") or "Starter Voice")[:120],
                                     category=str(item.get("category") or "")[:60],
                                     reference_text=SENTENCE,
                                     builtin_sha256=sha256(audio).hexdigest())
                continue
            if uid in previously_seen or path.is_file():
                # Preserve user edits and don't resurrect deleted built-in voices.
                continue
            tmp=path.with_suffix(".tmp")
            tmp.write_bytes(audio)
            tmp.replace(path)
            existing[uid]={
                "name":str(item.get("name") or "Starter Voice")[:120],
                "category":str(item.get("category") or "")[:60],
                "origin":"builtin-humperdinck",
                "reference_text":SENTENCE,
                "builtin_sha256":sha256(audio).hexdigest(),
                # The generated sample already has these adjustments baked in.
                "starter_refinement_notes":item.get("refinement_description") or {}
            }
            imported.append(uid)
        removed=[]
        if newer:
            # Built-in voices the publisher took out of the pack. Personal voices
            # never carry this origin, so they are never removed here.
            for uid,meta in list(existing.items()):
                if uid not in seen and isinstance(meta,dict) and meta.get("origin")=="builtin-humperdinck":
                    (voice_dir/(uid+".wav")).unlink(missing_ok=True)
                    existing.pop(uid)
                    removed.append(uid)
        temp=names_file.with_suffix(".tmp")
        temp.write_text(json.dumps(existing,indent=2))
        temp.replace(names_file)
        history_tmp=history_file.with_suffix(".tmp")
        history_tmp.write_text(json.dumps(sorted(previously_seen|seen),indent=2))
        history_tmp.replace(history_file)
        if newer:
            revision_tmp=revision_file.with_suffix(".tmp")
            revision_tmp.write_text(str(revision))
            revision_tmp.replace(revision_file)
        return {"installed":len(imported),"voices":imported,"updated":updated,"removed":removed,
                "revision":revision,"total_in_pack":len(voices)}
