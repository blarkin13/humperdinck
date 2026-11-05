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
        return [v for v in self._read().values() if
                (self.folder/(v["source_voice_id"]+".wav")).is_file()]

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
        stored[source_id]=metadata
        self._write(stored)
        return metadata

    def export(self,selected:list[str])->bytes:
        if not selected or len(selected)>30 or len(set(selected))!=len(selected):
            raise ValueError("Select between one and 30 unique approved starter voices")
        approvals=self._read()
        manifest={"format":"humperdinck-starter-voices","version":1,
                  "reference_text":SENTENCE,"voices":[]}
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
    """Only install the approved generated samples; preserve personal voices."""
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
        imported=[]
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
                # The generated sample already has these adjustments baked in.
                "starter_refinement_notes":item.get("refinement_description") or {}
            }
            imported.append(uid)
        temp=names_file.with_suffix(".tmp")
        temp.write_text(json.dumps(existing,indent=2))
        temp.replace(names_file)
        history_tmp=history_file.with_suffix(".tmp")
        history_tmp.write_text(json.dumps(sorted(previously_seen|seen),indent=2))
        history_tmp.replace(history_file)
        return {"installed":len(imported),"voices":imported,"total_in_pack":len(voices)}
