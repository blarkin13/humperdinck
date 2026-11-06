"""Local-only Humperdinck API."""
from contextlib import asynccontextmanager
from pathlib import Path
from uuid import uuid4
from threading import Thread, Lock
import json
from datetime import datetime, timezone
import soundfile as sf
import shutil
import subprocess
import os
import sys
from fastapi import FastAPI, UploadFile, File, HTTPException, Request
from fastapi.responses import FileResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from backend import engines
from backend.engine import export_mp3
from backend import updater
from backend.audio_edit import AudioEdit, render
from backend.jobs import JobStore
from backend import catalog
from backend import media_tools
from backend import native_models
from backend.voice_library import VoiceLibrary, build_instruction, FIELDS, TRAITS
from backend.sound_effects import SoundEffects
from backend.curated_sounds import BY_SLUG,public_catalog
from backend.sound_mix import fade_clip, assemble_narration, assemble_with_section_cues
from backend.sound_suggest import recommend
from backend.voice_refinement import normalize_refinement,refine_wav,suggest_sliders,DEFAULTS
from backend.starter_voice_packs import StarterVoices, SENTENCE as STARTER_VOICE_TEXT, PACK_NAME as STARTER_VOICE_PACK_NAME

ROOT = Path(__file__).resolve().parent.parent
DATA = Path(os.environ.get('HUMPERDINCK_DATA', ROOT / 'data'))
for folder in ('voices', 'outputs', 'videos', 'projects'):
    (DATA / folder).mkdir(parents=True, exist_ok=True)
@asynccontextmanager
async def lifespan(app):
    yield
    engines.pool.shutdown()  # free the warm model when the backend stops

app = FastAPI(title='Humperdinck', version='0.2.0', lifespan=lifespan)
app.add_middleware(CORSMiddleware, allow_origins=['http://localhost:5173','http://127.0.0.1:5173'], allow_methods=['*'], allow_headers=['*'])
engine_lock = Lock()
jobs = JobStore(DATA / 'jobs.sqlite3')
library = VoiceLibrary(DATA)
settings = catalog.Settings(DATA / 'settings.json')
sound_effects = SoundEffects(DATA)
starter_voices = StarterVoices(DATA)
starter_voice_jobs = {}

class Sentence(BaseModel):
    text: str
    start_seconds: float = Field(ge=0)

class Project(BaseModel):
    name: str
    sentences: list[Sentence]

class GenerateRequest(BaseModel):
    text: str = Field(min_length=1, max_length=100000)
    voice_id: str = ''
    voice_description: str = ''
    engine: str = 'qwen-clone'
    format: str = 'mp3'
    designed_voice_id: str = ''
    designed_version: int | None = None
    designed_mode: str = 'auto'  # auto, design, or reference
    refinement_override: dict | None = None

class RenameInput(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=120)
    category: str | None = Field(default=None, max_length=60)

@app.get('/api/health')
def health():
    choice = settings.load()
    return {'status':'ok', 'application':'humperdinck', 'version':'0.4.0', 'platform':catalog.platform_name(),
            'models':choice, 'design_ready':engines.installed(choice['design']['engine']),
            'clone_ready':engines.installed(choice['clone']['engine']),
            'ffmpeg':bool(shutil.which('ffmpeg')), 'resident_engine':engines.pool.status(),
            'native_package':os.environ.get('HUMPERDINCK_NATIVE_PACKAGE') == '1'}

@app.get('/api/server/status')
def server_status(request: Request):
    """Report only the loopback service that serves this specific desktop UI."""
    from urllib.parse import urlsplit
    parsed=urlsplit(str(request.base_url))
    return {'status':'running', 'mode':'local', 'url':str(request.base_url).rstrip('/'),
            'port':parsed.port, 'host':'127.0.0.1',
            'remote_access_enabled':False,
            'native_package':os.environ.get('HUMPERDINCK_NATIVE_PACKAGE')=='1'}

@app.post('/api/engine/unload')
def unload_engine():
    """Stop the warm engine worker now to free its memory; the next job reloads it."""
    if engines.pool.busy: raise HTTPException(409, 'An engine is generating; try again when it finishes')
    engines.pool.shutdown()
    return {'resident_engine':None}

def voice_meta():
    """Uploaded voice names and categories; names.json holds plain names from older versions."""
    names_path = DATA/'voices'/'names.json'
    names = json.loads(names_path.read_text()) if names_path.exists() else {}
    return {k:(v if isinstance(v,dict) else {'name':v,'category':''}) for k,v in names.items()}

def save_voice_meta(meta):
    (DATA/'voices'/'names.json').write_text(json.dumps(meta,indent=2))

def upload_path(voice_id):
    if not voice_id.isalnum(): raise HTTPException(400,'Invalid voice')
    path = DATA/'voices'/f'{voice_id}.wav'
    if not path.is_file(): raise HTTPException(404,'Voice not found')
    return path

@app.get('/api/starter-voices')
def list_starter_voices():
    return {'sentence':STARTER_VOICE_TEXT,'approved':starter_voices.list()}

@app.post('/api/starter-voices/{voice_id}/generate')
def generate_starter_voice_sample(voice_id:str):
    upload_path(voice_id)
    original=voice_meta().get(voice_id,{})
    if original.get('origin')=='starter-voice':
        raise HTTPException(400,'Use an original editable voice to prepare starter samples')
    job=generate(GenerateRequest(text=STARTER_VOICE_TEXT,
            voice_id=voice_id,engine='qwen-clone',format='wav'))
    starter_voice_jobs[job['job_id']]=voice_id
    return job

class StarterApproval(BaseModel):
    job_id:str = Field(min_length=32,max_length=32)

@app.post('/api/starter-voices/{voice_id}/approve')
def approve_starter_voice_sample(voice_id:str,request:StarterApproval):
    upload_path(voice_id)
    if starter_voice_jobs.get(request.job_id)!=voice_id:
        raise HTTPException(400,'Sample was not generated for this voice')
    job=jobs.get(request.job_id)
    if not job or job.get('status')!='complete':
        raise HTTPException(409,'Generate and listen to the completed sample first')
    wav=DATA/'outputs'/f'{request.job_id}.wav'
    meta=voice_meta().get(voice_id,{})
    try:
        approved=starter_voices.approve(voice_id,wav,{
            'name':meta.get('name',voice_id),
            'category':meta.get('category',''),
            'refinement':meta.get('refinement',{})
        })
    except (OSError,ValueError) as exc:
        raise HTTPException(400,str(exc))
    starter_voice_jobs.pop(request.job_id,None)
    return approved

class StarterExportInput(BaseModel):
    voice_ids:list[str] = Field(min_length=1,max_length=30)

@app.post('/api/starter-voices/export')
def export_starter_voice_pack(request:StarterExportInput):
    from fastapi.responses import Response
    try:
        archive=starter_voices.export(request.voice_ids)
    except (OSError,ValueError) as exc:
        raise HTTPException(400,str(exc))
    return Response(content=archive,media_type='application/zip',
        headers={'Content-Disposition':'attachment; filename="'+STARTER_VOICE_PACK_NAME+'"',
                 'Cache-Control':'no-store'})

@app.get('/api/voices')
def list_voices():
    meta = voice_meta()
    def info(p):
        try:
            details = sf.info(str(p))
            duration, rate, channels = round(details.duration, 1), details.samplerate, details.channels
        except Exception:
            duration = rate = channels = None
        return {'voice_id':p.stem, 'filename':meta.get(p.stem,{}).get('name',p.name), 'category':meta.get(p.stem,{}).get('category',''),
                'origin':meta.get(p.stem,{}).get('origin','uploaded'),
                'refinement':meta.get(p.stem,{}).get('refinement',{'sliders':DEFAULTS,'description':''}),
                'refinement_versions':len(meta.get(p.stem,{}).get('refinement_history',[])),
                'duration':duration, 'sample_rate':rate, 'channels':channels, 'size_kb':round(p.stat().st_size/1024),
                'added_at':datetime.fromtimestamp(p.stat().st_mtime, timezone.utc).isoformat()}
    return [info(p) for p in sorted((DATA/'voices').glob('*.wav'))]

@app.get('/api/voices/{voice_id}/audio')
def voice_audio(voice_id: str):
    return FileResponse(upload_path(voice_id), media_type='audio/wav')

@app.patch('/api/voices/{voice_id}')
def update_voice(voice_id: str, request: RenameInput):
    upload_path(voice_id)
    meta = voice_meta()
    entry = meta.setdefault(voice_id, {'name':voice_id,'category':''})
    if request.name: entry['name'] = request.name.strip()
    if request.category is not None: entry['category'] = request.category.strip()
    save_voice_meta(meta)
    return {'voice_id':voice_id, 'filename':entry['name'], 'category':entry['category']}

class VoiceRefinementInput(BaseModel):
    sliders: dict[str,int] = Field(default_factory=lambda: DEFAULTS.copy())
    description: str = Field(default='',max_length=1200)

class VoiceRefinementPreviewInput(VoiceRefinementInput):
    text: str = Field(min_length=1,max_length=600)

class VoiceGuidanceInput(BaseModel):
    description: str = Field(min_length=1,max_length=1200)
    sliders: dict[str,int] = Field(default_factory=lambda: DEFAULTS.copy())

@app.post('/api/voice-refinement/suggest')
def suggest_voice_refinement(request: VoiceGuidanceInput):
    try:
        current=normalize_refinement({'sliders':request.sliders,'description':request.description})
        return {'sliders':suggest_sliders(request.description,current),'method':'local keyword guidance'}
    except ValueError as exc:
        raise HTTPException(422,str(exc))

@app.get('/api/voices/{voice_id}/refinement')
def get_voice_refinement(voice_id: str):
    upload_path(voice_id)
    entry=voice_meta().get(voice_id,{})
    return {'refinement':entry.get('refinement',{'sliders':DEFAULTS,'description':''}),
            'history':entry.get('refinement_history',[])}

@app.put('/api/voices/{voice_id}/refinement')
def save_voice_refinement(voice_id: str, request: VoiceRefinementInput):
    upload_path(voice_id)
    try:
        updated=normalize_refinement(request.model_dump())
    except ValueError as exc:
        raise HTTPException(422,str(exc))
    meta=voice_meta()
    entry=meta.setdefault(voice_id,{'name':voice_id,'category':''})
    previous=entry.get('refinement',{'sliders':DEFAULTS.copy(),'description':''})
    if updated!=previous:
        history=entry.setdefault('refinement_history',[])
        history.append({'version':len(history)+1,'settings':updated,
                        'created_at':datetime.now(timezone.utc).isoformat()})
        entry['refinement']=updated
        save_voice_meta(meta)
    return {'refinement':entry.get('refinement',previous),
            'history':entry.get('refinement_history',[])}

@app.post('/api/voices/{voice_id}/refinement/restore/{version}')
def restore_voice_refinement(voice_id: str,version:int):
    upload_path(voice_id)
    meta=voice_meta()
    entry=meta.get(voice_id,{})
    prior=next((item['settings'] for item in entry.get('refinement_history',[])
                if item['version']==version),None)
    if prior is None:raise HTTPException(404,'Refinement version not found')
    entry['refinement']=prior
    save_voice_meta(meta)
    return {'refinement':prior,'history':entry.get('refinement_history',[])}

@app.post('/api/voices/{voice_id}/refinement-preview')
def preview_voice_refinement(voice_id:str,request:VoiceRefinementPreviewInput):
    upload_path(voice_id)
    try:
        refine=normalize_refinement(request.model_dump())
    except ValueError as exc:
        raise HTTPException(422,str(exc))
    return generate(GenerateRequest(text=request.text,voice_id=voice_id,
                                    engine='qwen-clone',format='wav',
                                    refinement_override=refine))

@app.delete('/api/voices/{voice_id}')
def delete_voice(voice_id: str):
    upload_path(voice_id).unlink()
    meta = voice_meta(); meta.pop(voice_id, None); save_voice_meta(meta)
    return {'deleted':True}

@app.post('/api/voices')
async def upload_voice(file: UploadFile = File(...)):
    suffix = Path(file.filename or '').suffix.lower()
    # .webm/.ogg/.mp4 are what browsers produce when recording from the microphone.
    if suffix not in ('.wav','.mp3','.flac','.m4a','.webm','.ogg','.mp4'):
        raise HTTPException(400, 'Supported formats: WAV, MP3, FLAC, M4A, OGG (or a browser recording)')
    if not shutil.which('ffmpeg'):
        raise HTTPException(503, 'FFmpeg is required to normalize voice recordings')
    raw = await file.read(65 * 1024 * 1024 + 1)
    if len(raw) > 30 * 1024 * 1024:
        raise HTTPException(413, 'Voice recording exceeds 30 MB')
    key = uuid4().hex
    source = DATA/'voices'/f'{key}.upload{suffix}'
    destination = DATA/'voices'/f'{key}.wav'
    source.write_bytes(raw)
    try:
        subprocess.run(['ffmpeg','-hide_banner','-loglevel','error','-y','-i',str(source),'-ac','1','-ar','24000',str(destination)], check=True, capture_output=True, timeout=90)
    except (subprocess.CalledProcessError, subprocess.TimeoutExpired):
        raise HTTPException(400, 'Could not decode voice recording')
    finally:
        source.unlink(missing_ok=True)
    meta = voice_meta()
    meta[key] = {'name':Path(file.filename or 'Imported voice').stem, 'category':'',
                 'origin':'recorded' if suffix in ('.webm','.ogg','.mp4') else 'uploaded'}
    save_voice_meta(meta)
    return {'voice_id':key, 'filename':meta[key]['name'], 'category':''}

class DesignedVoiceInput(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    category: str = Field(default='', max_length=60)
    description: str = Field(min_length=1, max_length=1200)
    characteristics: dict[str, int] = Field(default_factory=lambda: {'pitch':50,'rasp':50,'pace':50,'warmth':50})
    method: str = Field(default='', pattern='^(|sliders|prompt)$')  # how the voice was designed, shown on its card

class DesignedVersionInput(BaseModel):
    description: str = Field(min_length=1, max_length=1200)
    characteristics: dict[str, int]


class DraftPreviewInput(BaseModel):
    text: str = Field(min_length=1, max_length=600)
    description: str = Field(min_length=1, max_length=1200)
    characteristics: dict[str, int]

class AttachPreviewInput(BaseModel):
    job_id: str
    approve: bool = True

class PreviewInput(BaseModel):
    text: str = Field(min_length=1, max_length=2000)
    version: int | None = None

def check_characteristics(c):
    if not set(FIELDS) <= set(c) <= set(TRAITS) or any(type(v) is not int or not 0 <= v <= 100 for v in c.values()):
        raise HTTPException(422, f'Characteristics must include pitch, rasp, pace and warmth (optional: {", ".join(TRAITS[4:])}), each an integer from 0 to 100')

@app.get('/api/designed-voices')
def designed_voices():
    result = library.list()
    for item in result:
        detail = library.get(item['id'])
        active = next((v for v in detail['versions'] if v['version'] == item['active_version']), None)
        item['approved_sample_id'] = active['approved_sample_id'] if active else None
        usable = library.latest_approved(item['id'])
        item['narration_version'] = usable['version'] if usable else None
        item['narration_sample_id'] = usable['sample_id'] if usable else None
        # Card details: the active recipe plus library totals.
        item['description'] = active['description'] if active else ''
        item['characteristics'] = active['characteristics'] if active else {}
        item['model_id'] = active['model_id'] if active else ''
        item['version_count'] = len(detail['versions'])
        item['sample_count'] = sum(len(v['samples']) for v in detail['versions'])
        item['preview_sample_id'] = item['approved_sample_id'] or item['narration_sample_id'] or next(
            (s['id'] for v in detail['versions'] if v['version'] == item['active_version'] for s in v['samples']), None)
    return result

@app.post('/api/designed-voices', status_code=201)
def create_designed_voice(request: DesignedVoiceInput):
    check_characteristics(request.characteristics)
    return library.create(request.name.strip(),request.description.strip(),request.characteristics,settings.load()['design']['model'],request.category.strip(),request.method)

@app.get('/api/designed-voices/{voice_id}')
def get_designed_voice(voice_id: str):
    return library.get(voice_id) or _missing_voice()

def _missing_voice():
    raise HTTPException(404, 'Designed voice not found')

@app.post('/api/designed-voices/{voice_id}/versions', status_code=201)
def create_designed_version(voice_id: str, request: DesignedVersionInput):
    check_characteristics(request.characteristics)
    return library.version(voice_id,request.description.strip(),request.characteristics,settings.load()['design']['model']) or _missing_voice()

@app.post('/api/designed-voices/{voice_id}/versions/{version}/activate')
def activate_designed_version(voice_id: str, version: int):
    return library.activate(voice_id,version) or _missing_voice()

@app.patch('/api/designed-voices/{voice_id}')
def rename_designed_voice(voice_id: str, request: RenameInput):
    library.get(voice_id) or _missing_voice()
    return library.rename(voice_id, request.name.strip() if request.name else None,
                          request.category.strip() if request.category is not None else None)

@app.delete('/api/designed-voices/{voice_id}/versions/{version}')
def delete_designed_version(voice_id: str, version: int):
    library.get(voice_id) or _missing_voice()
    try:
        return library.delete_version(voice_id, version) or _missing_version()
    except ValueError as exc:
        raise HTTPException(409, str(exc))

def _missing_version():
    raise HTTPException(404, 'Voice version not found')

@app.delete('/api/designed-voices/{voice_id}')
def delete_designed_voice(voice_id: str):
    if not library.delete(voice_id): _missing_voice()
    return {'deleted':True}

@app.post('/api/designed-voices/{voice_id}/duplicate', status_code=201)
def duplicate_designed_voice(voice_id: str):
    voice = library.get(voice_id) or _missing_voice()
    version = next(v for v in voice['versions'] if v['version']==voice['active_version'])
    return library.create(voice['name']+' (copy)',version['description'],version['characteristics'],version['model_id'],voice.get('category',''))

@app.post('/api/designed-voices/draft-preview')
def draft_preview(request: DraftPreviewInput):
    """Preview a voice recipe without creating a saved voice."""
    check_characteristics(request.characteristics)
    instruction = build_instruction(request.description, request.characteristics)
    if len(instruction) > 1200:
        raise HTTPException(422, 'Combined voice instruction exceeds 1200 characters')
    result = generate(GenerateRequest(text=request.text, voice_description=instruction,
                                      engine='qwen-design', format='wav'))
    # Return the actual instruction and selected checkpoint for reproducible comparisons.
    result['design_instruction'] = instruction
    result['design_model'] = settings.load()['design']['model']
    jobs[result['job_id']]['draft_preview'] = True
    jobs[result['job_id']]['preview_text'] = request.text
    return result

@app.post('/api/designed-voices/{voice_id}/versions/{version}/attach-preview')
def attach_draft_preview(voice_id: str, version: int, request: AttachPreviewInput):
    """Copy a completed draft preview into the voice library, optionally approving it."""
    voice = library.get(voice_id) or _missing_voice()
    if not any(v['version'] == version for v in voice['versions']):
        raise HTTPException(404, 'Voice version not found')
    job = jobs.get(request.job_id)
    if not job or not job.get('draft_preview') or job.get('status') != 'complete':
        raise HTTPException(400, 'Completed draft preview not found in this session')
    if job.get('attached_to'):
        raise HTTPException(409, 'Preview already attached to a voice')
    source = DATA / 'outputs' / f"{request.job_id}.wav"
    if not source.is_file():
        raise HTTPException(404, 'Preview audio no longer available')
    sample = library.sample(voice_id, version, job['preview_text'], source)
    if request.approve:
        library.approve_sample(voice_id, version, sample['id'])
    job['attached_to'] = {'voice_id': voice_id, 'version': version, 'sample_id': sample['id']}
    return {'sample': sample, 'approved': request.approve}

@app.post('/api/designed-voices/{voice_id}/preview')
def preview_designed_voice(voice_id: str, request: PreviewInput):
    voice = library.get(voice_id) or _missing_voice()
    version_number = request.version or voice['active_version']
    if not any(v['version']==version_number for v in voice['versions']):
        raise HTTPException(404,'Voice version not found')
    return generate(GenerateRequest(text=request.text,engine='qwen-design',format='wav',designed_voice_id=voice_id,designed_version=version_number))

@app.post('/api/designed-voices/{voice_id}/versions/{version}/approve/{sample_id}')
def approve_designed_sample(voice_id: str, version: int, sample_id: str):
    approved = library.approve_sample(voice_id, version, sample_id)
    if not approved:
        raise HTTPException(404, 'Preview not found for this voice version')
    return approved

@app.get('/api/designed-samples/{sample_id}')
def designed_sample(sample_id: str):
    path = library.sample_file(sample_id)
    if not path or not path.is_file(): raise HTTPException(404, 'Sample not found')
    return FileResponse(path, media_type='audio/wav')

@app.post('/api/projects')
def save_project(project: Project):
    key = uuid4().hex
    (DATA/'projects'/f'{key}.json').write_text(project.model_dump_json(indent=2), encoding='utf-8')
    return {'project_id':key}

@app.get('/api/projects/{project_id}')
def get_project(project_id: str):
    if not project_id.isalnum(): raise HTTPException(400, 'Invalid project ID')
    path = DATA/'projects'/f'{project_id}.json'
    if not path.exists(): raise HTTPException(404, 'Not found')
    return json.loads(path.read_text(encoding='utf-8'))

@app.post('/api/videos')
async def upload_video(file: UploadFile = File(...)):
    suffix = Path(file.filename or '').suffix.lower()
    if suffix not in ('.mp4','.mov','.mkv','.webm'):
        raise HTTPException(400, 'Unsupported video format')
    key = uuid4().hex
    path = DATA/'videos'/f'{key}{suffix}'
    with path.open('wb') as output:
        while chunk := await file.read(1024 * 1024):
            output.write(chunk)
    return {'video_id':key, 'filename':file.filename}

def run_generation(job_id, request):
    job = jobs[job_id]
    wav = DATA/'outputs'/f'{job_id}.wav'
    try:
        with engine_lock:
            job.update(status='running', message='Loading model (first run may download weights)')
            progress = lambda done,total: job.update(progress=round(done/total*100), message=f'Generated {done}/{total} segments')
            choice = settings.load()
            if request.engine == 'qwen-design':
                engines.design(choice['design'], wav, request.text, request.voice_description, progress)
            else:
                ref_text = None
                if request.engine == 'designed-reference':
                    sample_id = library.approved_sample_id(request.designed_voice_id, request.designed_version)
                    reference = library.approved_sample(request.designed_voice_id, request.designed_version)
                    ref_text = library.sample_text(sample_id) if sample_id else None
                else:
                    reference = DATA/'voices'/f'{request.voice_id}.wav'
                    ref_text=voice_meta().get(request.voice_id,{}).get('reference_text')
                if not reference or not reference.is_file():
                    raise ValueError('Approved reference audio is missing')
                engines.clone(choice['clone'], wav, request.text, reference, ref_text, progress)
                if request.engine=='qwen-clone':
                    entry=voice_meta().get(request.voice_id,{})
                    refine= request.refinement_override if request.refinement_override is not None else entry.get('refinement')
                    if refine:refine_wav(wav,refine)
            if request.designed_voice_id and request.engine == 'qwen-design':
                job['sample'] = library.sample(request.designed_voice_id,request.designed_version,request.text,wav)
            if request.format == 'mp3':
                job.update(message='Encoding MP3')
                export_mp3(wav, DATA/'outputs'/f'{job_id}.mp3')
        job.update(status='complete', progress=100, download_url=f'/api/outputs/{job_id}.{request.format}', message='Ready to download')
    except Exception as exc:
        job.update(status='failed', message=f'{type(exc).__name__}: {exc}')

@app.post('/api/generate')
def generate(request: GenerateRequest):
    if request.format not in ('wav','mp3'):
        raise HTTPException(400, 'Format must be wav or mp3')
    if request.engine not in ('qwen-clone', 'qwen-design', 'designed-reference'):
        raise HTTPException(400, 'Unsupported engine')
    if request.designed_voice_id:
        if request.engine not in ('qwen-design','designed-reference'): raise HTTPException(400, 'Unsupported designed voice engine')
        stored = library.get(request.designed_voice_id) or _missing_voice()
        version = request.designed_version or stored['active_version']
        found = next((v for v in stored['versions'] if v['version']==version), None)
        if not found: raise HTTPException(404,'Voice version not found')
        request.designed_version = version
        request.voice_description = build_instruction(found['description'],found['characteristics'])
    if request.engine == 'designed-reference':
        if not request.designed_voice_id or not library.approved_sample(request.designed_voice_id, request.designed_version):
            raise HTTPException(400, 'Approve a voice preview first')
    if request.engine == 'qwen-design' and not request.voice_description.strip():
        raise HTTPException(400, 'Voice description required')
    if request.engine == 'qwen-design' and len(request.voice_description) > 1200:
        raise HTTPException(400, 'Voice description too long')
    if request.refinement_override is not None:
        if request.engine!='qwen-clone':raise HTTPException(422,'Refinements require an uploaded voice')
        try:request.refinement_override=normalize_refinement(request.refinement_override)
        except ValueError as exc:raise HTTPException(422,str(exc))
    if request.engine == 'qwen-clone' and (not request.voice_id.isalnum() or not (DATA/'voices'/f'{request.voice_id}.wav').is_file()):
        raise HTTPException(404, 'Voice profile not found')
    require_engine('design' if request.engine == 'qwen-design' else 'clone')
    if request.format == 'mp3' and not shutil.which('ffmpeg'):
        raise HTTPException(503, 'FFmpeg is required for MP3 export')
    job_id = uuid4().hex
    jobs[job_id] = {'job_id':job_id, 'status':'queued', 'progress':0, 'message':'Waiting for voice engine'}
    Thread(target=run_generation, args=(job_id,request), daemon=True).start()
    return jobs[job_id]

@app.get('/api/jobs/{job_id}')
def job_status(job_id: str):
    if job_id not in jobs: raise HTTPException(404, 'Job not found')
    return jobs[job_id]

MEDIA_TYPES = {'.wav':'audio/wav', '.mp3':'audio/mpeg', '.mp4':'video/mp4', '.mov':'video/quicktime', '.webm':'video/webm', '.m4v':'video/mp4'}

@app.get('/api/outputs/{filename}')
def download_output(filename: str):
    if len(filename.split('.')[0]) != 32 or not all(c in '0123456789abcdef' for c in filename.split('.')[0]):
        raise HTTPException(400, 'Invalid filename')
    if Path(filename).suffix not in ('.wav','.mp3','.mp4'):
        raise HTTPException(400, 'Invalid format')
    path = DATA/'outputs'/filename
    if not path.is_file(): raise HTTPException(404, 'Not found')
    # Explicit types: Windows guesses from the registry, which can break in-page playback.
    # Inline so <audio>/<video> players can stream it; the download links still save it with this name.
    return FileResponse(path, media_type=MEDIA_TYPES[path.suffix], filename=filename, content_disposition_type='inline')


def remove_speech_direction_tags(text: str) -> str:
    """Known editorial tags should never be pronounced by desktop TTS engines."""
    import re
    return re.sub(r'\[(?:whispering|excited|curious|calm|sad|serious)\]\s*', '', text, flags=re.IGNORECASE).strip()



# Locally imported sound effects are never sent to an external service.
class EffectMetadata(BaseModel):
    name: str | None = Field(default=None,max_length=120)
    category: str | None = Field(default=None,max_length=60)
    favorite: bool | None = None

class SoundSuggestionRequest(BaseModel):
    text: str = Field(min_length=1,max_length=10000)

@app.post('/api/sound-effects/suggest')
def suggest_sound_effects(request: SoundSuggestionRequest):
    return recommend(request.text,sound_effects.list())

@app.post('/api/sound-effects/import-pack')
async def bulk_import_sound_pack(file: UploadFile=File(...)):
    if not (file.filename or '').lower().endswith('.zip'):
        raise HTTPException(400,'Choose a Humperdinck sound pack ZIP file')
    raw=await file.read(150*1024*1024+1)
    if len(raw)>150*1024*1024:
        raise HTTPException(413,'Sound pack exceeds 150 MB')
    try:
        return sound_effects.import_pack(raw)
    except (ValueError,KeyError) as exc:
        raise HTTPException(400,str(exc))

@app.get('/api/sound-effects/curated')
def curated_sound_catalog():
    return public_catalog(sound_effects.list())

@app.post('/api/sound-effects/curated/{slug}/import')
async def import_curated_sound(slug:str,file:UploadFile=File(...)):
    source=BY_SLUG.get(slug)
    if source is None:raise HTTPException(404,'Unknown CC0 recording')
    # The selected file is supplied by the user after downloading at Freesound.
    raw=await file.read(65*1024*1024+1)
    if len(raw)>65*1024*1024:
        raise HTTPException(413,'Recording exceeds 65 MB')
    try:
        return sound_effects.import_curated(source,raw,file.filename or 'recording.wav')
    except ValueError as exc:raise HTTPException(400,str(exc))

@app.post('/api/sound-effects/curated/{slug}/install')
def install_curated_sound(slug:str):
    """Only pre-approved public Wikimedia URL; never arbitrary URL fetch."""
    from urllib.request import urlopen,Request
    from urllib.error import URLError,HTTPError
    import hashlib
    source=BY_SLUG.get(slug)
    if source is None:raise HTTPException(404,'Unknown CC0 recording')
    if 'download_url' not in source:
        raise HTTPException(400,'Download the original at Freesound, then import the file')
    existing=next((v for v in sound_effects.list() if v.get('curated_slug')==slug),None)
    if existing:return existing
    try:
        request=Request(source['download_url'],headers={'User-Agent':'Humperdinck-CC0-library/1.0'})
        with urlopen(request,timeout=20) as response:
            raw=response.read(12*1024*1024+1)
    except (OSError,URLError,HTTPError) as exc:
        raise HTTPException(502,'Could not download the public-domain recording') from exc
    if len(raw)>12*1024*1024 or hashlib.sha1(raw).hexdigest()!=source['sha1']:
        raise HTTPException(502,'Source checksum did not match the verified Commons recording')
    try:
        return sound_effects.import_curated(source,raw,source['filename'])
    except ValueError as exc:raise HTTPException(400,str(exc))

@app.get('/api/sound-effects')
def list_sound_effects():
    return sound_effects.list()

@app.post('/api/sound-effects')
async def upload_sound_effect(file: UploadFile = File(...)):
    try:
        raw = await file.read(30 * 1024 * 1024 + 1)
        return sound_effects.add(file.filename or '',raw)
    except ValueError as exc:
        raise HTTPException(400,str(exc))

@app.get('/api/sound-effects/{effect_id}/audio')
def play_sound_effect(effect_id: str):
    try:
        path=sound_effects.get_path(effect_id)
    except (ValueError,FileNotFoundError) as exc:
        raise HTTPException(404,str(exc))
    return FileResponse(path,media_type='audio/wav')

@app.patch('/api/sound-effects/{effect_id}')
def update_sound_effect(effect_id: str,metadata: EffectMetadata):
    try:
        return sound_effects.update(effect_id,metadata.name,metadata.category,metadata.favorite)
    except (ValueError,FileNotFoundError) as exc:
        raise HTTPException(404,str(exc))

@app.delete('/api/sound-effects/{effect_id}')
def delete_sound_effect(effect_id: str):
    try:
        return sound_effects.delete(effect_id)
    except (ValueError,FileNotFoundError) as exc:
        raise HTTPException(404,str(exc))

class NarrationEffect(BaseModel):
    sound_id: str = Field(min_length=32,max_length=32)
    position: str = 'after'  # before, after, or mix (layer with speech)
    volume: float = Field(default=0.8,ge=0,le=2)
    fade_in: float = Field(default=0,ge=0,le=10)
    fade_out: float = Field(default=0,ge=0,le=10)
    loop: bool = False
    ending: str = 'section'  # section boundary or natural end across sections
    ducking: float = Field(default=1,ge=0,le=1)

class NarrationAmbience(BaseModel):
    sound_id: str = Field(min_length=32,max_length=32)
    volume: float = Field(default=0.25,ge=0,le=1.5)
    ducking: float = Field(default=0.35,ge=0,le=1)
    fade_in: float = Field(default=0.5,ge=0,le=10)
    fade_out: float = Field(default=0.5,ge=0,le=10)

class NarrationBlock(BaseModel):
    text: str = Field(min_length=1, max_length=10000)
    voice_key: str = Field(min_length=1)
    delay_after: float = Field(default=0, ge=0, le=30)
    effects: list[NarrationEffect] = Field(default_factory=list,max_length=8)

class MultiNarrationRequest(BaseModel):
    blocks: list[NarrationBlock] = Field(min_length=1, max_length=80)
    format: str = 'mp3'
    name: str = Field(default='Narration', max_length=120)
    ambience: NarrationAmbience | None = None

def require_engine(role):
    choice = settings.load()[role]
    label = catalog.ENGINES[choice['engine']]['label']
    if not engines.available(choice['engine']):
        raise HTTPException(503, f'{label} is not installed. Open the Models tab to install it or choose another model.')
    # Engines run offline, so a model that was never downloaded cannot load.
    if os.environ.get('HUMPERDINCK_ONLINE') != '1' and not catalog.downloaded(choice['model']):
        raise HTTPException(503, f"{choice['model']} has not been downloaded. Open the Models tab and click Download.")

@app.get('/api/preset-voices')
def list_preset_voices():
    """Preset narration voices whose engine and weights are already installed."""
    return [
        {'key': f'preset:{engine}:{voice}', 'engine': engine, 'voice': voice,
         'name': label, 'accent': accent}
        for engine, available in catalog.PRESET_VOICES.items()
        if engines.installed(engine)
        for voice, (label, accent) in available.items()
        if catalog.downloaded(voice)
    ]



# A fixed, reusable comparison recording for every Voice Library card.
VOICE_PREVIEW_TEXT = 'Good evening. I have been waiting a long time to tell you this story.'
PREVIEW_DIR = DATA / 'voice-previews'
PREVIEW_DIR.mkdir(parents=True, exist_ok=True)
preview_pending = {}
preview_pending_lock = Lock()


class LibraryPreviewRequest(BaseModel):
    voice_key: str = Field(min_length=3, max_length=150)


def preview_recipe(key):
    """Resolve a voice and key its cache by actual source/model, not display name."""
    import hashlib
    if key.startswith('design:'):
        voice_id = key[7:]
        voice = library.get(voice_id) or _missing_voice()
        approved = library.latest_approved(voice_id)
        if approved:
            reference = approved['path']
            ref_text = approved['text']
            mode = 'clone'
        else:
            active = next((v for v in voice['versions'] if v['version'] == voice['active_version']), None)
            if not active:
                raise HTTPException(404, 'Designed voice version not found')
            mode = 'design'
            reference = None
            ref_text = build_instruction(active['description'], active['characteristics'])
        choice = settings.load()[mode]
    else:
        reference, ref_text = resolve_voice_key(key)
        mode = 'preset' if reference is None else 'clone'
        if mode == 'preset':
            engine, model = ref_text
            choice = {'engine': engine, 'model': model}
        else:
            choice = settings.load()['clone']
    source = {'voice': key, 'mode': mode, 'choice': choice,
              'prompt': VOICE_PREVIEW_TEXT}
    if key.startswith('upload:'):
        source['refinement']=voice_meta().get(key[7:],{}).get('refinement')
    if reference is not None:
        source['reference'] = str(reference)
        source['reference_mtime'] = reference.stat().st_mtime_ns
        source['reference_bytes'] = reference.stat().st_size
        source['reference_text'] = ref_text
    elif mode == 'design':
        source['description'] = ref_text
    digest = hashlib.sha256(json.dumps(source, sort_keys=True).encode()).hexdigest()
    return mode, choice, reference, ref_text, digest


def generate_library_preview(job_id, mode, choice, reference, ref_text, digest, refinement=None):
    job = jobs[job_id]
    path = PREVIEW_DIR / (digest + '.wav')
    temp = PREVIEW_DIR / (digest + '-' + job_id + '.wav')
    try:
        with engine_lock:
            job.update(status='running', message='Generating voice comparison preview')
            progress = lambda done, total: job.update(progress=round(done / total * 95),
                                                      message=f'Preview: {done}/{total} segments')
            if mode == 'preset':
                engines.preset(choice['engine'], choice['model'], temp, VOICE_PREVIEW_TEXT, on_progress=progress)
            elif mode == 'design':
                engines.design(choice, temp, VOICE_PREVIEW_TEXT, ref_text, on_progress=progress)
            else:
                engines.clone(choice, temp, VOICE_PREVIEW_TEXT, reference, ref_text, on_progress=progress)
                if refinement:refine_wav(temp,refinement)
            temp.replace(path)
        job.update(status='complete', progress=100, message='Voice preview ready',
                   download_url=f'/api/voice-previews/{digest}.wav')
    except Exception as exc:
        job.update(status='failed', message=f'Preview failed: {exc}')
    finally:
        temp.unlink(missing_ok=True)
        with preview_pending_lock:
            preview_pending.pop(digest, None)


@app.post('/api/voice-previews')
def create_library_preview(request: LibraryPreviewRequest):
    mode, choice, reference, ref_text, digest = preview_recipe(request.voice_key)
    destination = PREVIEW_DIR / (digest + '.wav')
    if destination.is_file() and destination.stat().st_size:
        return {'status': 'complete', 'download_url': f'/api/voice-previews/{digest}.wav'}
    with preview_pending_lock:
        old_id = preview_pending.get(digest)
        if old_id:
            return jobs[old_id]
        job_id = uuid4().hex
        jobs[job_id] = {'job_id': job_id, 'status': 'queued', 'progress': 0,
                        'message': 'Waiting to generate comparison preview'}
        preview_pending[digest] = job_id
    refinement=voice_meta().get(request.voice_key[7:],{}).get('refinement') if request.voice_key.startswith('upload:') else None
    Thread(target=generate_library_preview,
           args=(job_id, mode, choice, reference, ref_text, digest,refinement), daemon=True).start()
    return jobs[job_id]


@app.get('/api/voice-previews/{filename}')
def library_preview_audio(filename: str):
    digest, dot, extension = filename.partition('.')
    if dot != '.' or extension != 'wav' or len(digest) != 64 or any(c not in '0123456789abcdef' for c in digest):
        raise HTTPException(404, 'Preview not found')
    path = PREVIEW_DIR / filename
    if not path.is_file():
        raise HTTPException(404, 'Preview not found')
    return FileResponse(path, media_type='audio/wav')


def resolve_voice_key(key):
    """Return (reference audio, its transcript or None) for a narration voice."""
    # Presets identify a fixed local model rather than an audio reference.
    if key.startswith('preset:'):
        parts = key.split(':')
        if len(parts) != 3 or parts[1] not in catalog.PRESET_VOICES or parts[2] not in catalog.PRESET_VOICES[parts[1]]:
            raise HTTPException(400, 'Unknown preset voice')
        engine, voice = parts[1:]
        if not catalog.downloaded(voice) or not engines.installed(engine):
            raise HTTPException(503, f'{engine} voice {voice} is not installed. Download it in Models.')
        return None, (engine, voice)
    # Saved designed voices have approved audio; uploads are already normalized WAV.
    if key.startswith('design:'):
        identifier = key[7:]
        voice = library.get(identifier) or _missing_voice()
        approved = library.latest_approved(identifier)
        path = approved['path'] if approved else None
        text = approved['text'] if approved else None
    elif key.startswith('upload:'):
        identifier = key[7:]
        if not identifier.isalnum(): raise HTTPException(400,'Invalid voice')
        path = DATA/'voices'/f'{identifier}.wav'
        text = voice_meta().get(identifier,{}).get('reference_text')
    else:
        raise HTTPException(400,'Unknown voice selection')
    if not path or not path.is_file():
        raise HTTPException(400,'Voice needs an approved reference recording')
    return path, text

def run_multi(job_id, request, references):
    job = jobs[job_id]
    try:
        import soundfile as sf
        import numpy as np
        with engine_lock:
            job.update(status='running',message='Generating narration')
            sections=[]; section_cues=[]; target_rate=24000
            choice=settings.load()['clone']
            for index,(block,(reference,ref_text)) in enumerate(zip(request.blocks,references)):
                temp=DATA/'outputs'/f'{job_id}-{index}.wav'
                try:
                    def progress(done, total):
                        job.update(progress=round((index + done / total) / len(references) * 95),
                                   message=f'Block {index+1}/{len(references)} · {done}/{total} segments')
                    narration_text = remove_speech_direction_tags(block.text)
                    if not narration_text:
                        raise ValueError('A narration section needs words beyond speech direction tags')
                    if reference is None:
                        preset_engine, preset_voice = ref_text
                        engines.preset(preset_engine, preset_voice, temp, narration_text, on_progress=progress)
                    else:
                        engines.clone(choice, temp, narration_text, reference, ref_text, on_progress=progress)
                    audio,rate=sf.read(temp,dtype='float32',always_2d=False)
                    if audio.ndim==2: audio=audio.mean(axis=1)
                    if rate!=target_rate:
                        # ffmpeg resampling keeps the output uniform without scipy.
                        resampled=DATA/'outputs'/f'{job_id}-{index}-resampled.wav'
                        subprocess.run(['ffmpeg','-v','error','-y','-i',str(temp),'-ar',str(target_rate),'-ac','1',str(resampled)],check=True,timeout=120)
                        audio,_=sf.read(resampled,dtype='float32')
                        resampled.unlink(missing_ok=True)
                    if block.voice_key.startswith('upload:'):
                        current=voice_meta().get(block.voice_key[7:],{}).get('refinement')
                        if current:
                            refined=DATA/'outputs'/f'{job_id}-{index}-refined.wav'
                            sf.write(refined,audio,target_rate)
                            try:
                                refine_wav(refined,current)
                                audio,_=sf.read(refined,dtype='float32')
                            finally:refined.unlink(missing_ok=True)
                    for effect in block.effects:
                        if effect.position not in ('before','after','mix'):
                            raise ValueError('Invalid sound effect position')
                    # Sounds are rendered in sequence around their assigned narration block.
                    def effect_clips(position):
                        rendered=[]
                        for assigned in block.effects:
                            if assigned.position!=position:continue
                            effect_path=sound_effects.get_path(assigned.sound_id)
                            sound,sound_rate=sf.read(effect_path,dtype='float32',always_2d=False)
                            if sound.ndim==2:sound=sound.mean(axis=1)
                            if sound_rate!=target_rate:
                                raise ValueError('Sound effect must be normalized to 24000 Hz')
                            scaled=np.clip(sound*assigned.volume,-1,1)
                            rendered.append(fade_clip(scaled,target_rate,assigned.fade_in,assigned.fade_out))
                        return rendered
                    layers=[]
                    for effect in block.effects:
                        if effect.position!='mix':continue
                        if effect.ending not in ('section','natural'):
                            raise ValueError('Unknown sound effect ending')
                        sound,sound_rate=sf.read(sound_effects.get_path(effect.sound_id),dtype='float32',always_2d=False)
                        if sound.ndim==2:sound=sound.mean(axis=1)
                        if sound_rate!=target_rate:
                            raise ValueError('Sound effect must be normalized to 24000 Hz')
                        layers.append({'audio':sound,'volume':effect.volume,
                                       'loop':effect.loop,'ending':effect.ending,
                                       'ducking':effect.ducking,
                                       'fade_in':effect.fade_in,'fade_out':effect.fade_out})
                    delay=round(target_rate*block.delay_after) if index<len(references)-1 else 0
                    sections.append((effect_clips('before'),audio,effect_clips('after'),delay))
                    section_cues.append(layers)
                finally: temp.unlink(missing_ok=True)
                job.update(progress=round((index+1)/len(references)*95),message=f'Generated block {index+1}/{len(references)}')
            ambience_audio=None
            ambience=request.ambience
            if ambience is not None:
                ambience_audio,ambience_rate=sf.read(sound_effects.get_path(ambience.sound_id),dtype='float32',always_2d=False)
                if ambience_audio.ndim==2:ambience_audio=ambience_audio.mean(axis=1)
                if ambience_rate!=target_rate:raise ValueError('Ambience must use 24000 Hz audio')
            mixed=assemble_with_section_cues(sections,section_cues,sample_rate=target_rate)
            # Backward compatibility with narration requests using a global bed.
            if ambience_audio is not None:
                from backend.sound_mix import mix_ambience
                dry_masks=[]
                for before,voice,after,silence in sections:
                    for effect_audio in before: dry_masks.extend([False]*len(effect_audio))
                    dry_masks.extend([True]*len(voice))
                    for effect_audio in after: dry_masks.extend([False]*len(effect_audio))
                    dry_masks.extend([False]*silence)
                mixed=mix_ambience(mixed,ambience_audio,np.array(dry_masks,dtype=bool),
                    sample_rate=target_rate,volume=ambience.volume,ducking=ambience.ducking,
                    fade_in=ambience.fade_in,fade_out=ambience.fade_out)
            wav=DATA/'outputs'/f'{job_id}.wav'
            sf.write(wav,mixed,target_rate,subtype='PCM_16')
            if request.format=='mp3': export_mp3(wav,DATA/'outputs'/f'{job_id}.mp3')
            job.update(status='complete',progress=100,download_url=f'/api/outputs/{job_id}.{request.format}',message='Narration ready')
    except Exception as exc:
        job.update(status='failed',message=f'{type(exc).__name__}: {exc}')

@app.post('/api/narrations')
def create_narration(request: MultiNarrationRequest):
    if request.format not in ('wav','mp3'): raise HTTPException(400,'Unsupported format')
    if request.format=='mp3' and not shutil.which('ffmpeg'): raise HTTPException(503,'FFmpeg is required')
    for block in request.blocks:
        for effect in block.effects:
            if effect.position not in ('before','after','mix'):
                raise HTTPException(400,'Sound effect position must be before, after, or mixed with narration')
            if effect.ending not in ('section','natural'):
                raise HTTPException(400,'Sound effect ending must be section or natural')
            try:
                sound_effects.get_path(effect.sound_id)
            except (ValueError,FileNotFoundError):
                raise HTTPException(404,'A narration sound effect is missing from the library')
    if request.ambience is not None:
        try:
            sound_effects.get_path(request.ambience.sound_id)
        except (ValueError,FileNotFoundError):
            raise HTTPException(404,'The background ambience is missing from the library')
    references=[resolve_voice_key(b.voice_key) for b in request.blocks]
    if any(reference is not None for reference, _ in references):
        require_engine('clone')
    job_id=uuid4().hex
    jobs[job_id]={'job_id':job_id,'status':'queued','progress':0,'message':'Waiting for narration engine'}
    Thread(target=run_multi,args=(job_id,request,references),daemon=True).start()
    return jobs[job_id]

class VideoRenderRequest(BaseModel):
    video_id: str
    narration_job_id: str
    start_seconds: float = Field(default=0,ge=0,le=86400)
    keep_original_audio: bool = False

@app.get('/api/videos/{video_id}')
def get_video(video_id: str):
    if len(video_id)!=32 or not all(c in '0123456789abcdef' for c in video_id):
        raise HTTPException(400,'Invalid video ID')
    matches=list((DATA/'videos').glob(video_id+'.*'))
    if not matches: raise HTTPException(404,'Video not found')
    return FileResponse(matches[0], media_type=MEDIA_TYPES.get(matches[0].suffix.lower(), 'application/octet-stream'))

def run_video_render(job_id,video_path,audio_path,request):
    job=jobs[job_id]
    try:
        job.update(status='running',message='Rendering video with narration')
        output=DATA/'outputs'/f'{job_id}.mp4'
        # Mix original audio only when explicitly requested; video may not contain an audio stream.
        # Delayed narration is padded with silence and placed at the requested timestamp.
        delay=int(request.start_seconds*1000)
        if request.keep_original_audio:
            probe=subprocess.run(['ffprobe','-v','error','-select_streams','a','-show_entries','stream=index','-of','csv=p=0',str(video_path)],capture_output=True,text=True,timeout=30)
            has_audio=bool(probe.stdout.strip())
        else: has_audio=False
        if has_audio:
            filters=f'[1:a]adelay={delay}:all=1[n];[0:a][n]amix=inputs=2:duration=longest:normalize=0[a]'
        else:
            filters=f'[1:a]adelay={delay}:all=1[a]'
        command=['ffmpeg','-hide_banner','-loglevel','error','-y','-i',str(video_path),'-i',str(audio_path),'-filter_complex',filters,'-map','0:v:0','-map','[a]',*media_tools.video_encoder_args(),'-c:a','aac','-b:a','192k','-movflags','+faststart','-shortest',str(output)]
        subprocess.run(command,check=True,capture_output=True,text=True,timeout=3600)
        job.update(status='complete',progress=100,download_url=f'/api/outputs/{job_id}.mp4',message='Video ready')
    except Exception as exc:
        job.update(status='failed',message=f'{type(exc).__name__}: {exc}')

@app.post('/api/video-renders')
def create_video_render(request: VideoRenderRequest):
    if not shutil.which('ffmpeg'): raise HTTPException(503,'FFmpeg is required')
    video_id=request.video_id
    if len(video_id)!=32 or not all(c in '0123456789abcdef' for c in video_id): raise HTTPException(400,'Invalid video ID')
    video=next(iter((DATA/'videos').glob(video_id+'.*')),None)
    if not video: raise HTTPException(404,'Video not found')
    narration_id=request.narration_job_id
    if len(narration_id)!=32 or not all(c in '0123456789abcdef' for c in narration_id): raise HTTPException(400,'Invalid narration ID')
    source_job=jobs.get(narration_id)
    audio=DATA/'outputs'/f'{narration_id}.wav'
    # A finished narration on disk is usable even if its job record predates job tracking.
    if source_job and source_job.get('status')!='complete': raise HTTPException(400,'Narration is not finished yet')
    if not audio.is_file(): raise HTTPException(404,'Narration audio not found')
    job_id=uuid4().hex
    jobs[job_id]={'job_id':job_id,'status':'queued','progress':0,'message':'Waiting to render video'}
    Thread(target=run_video_render,args=(job_id,video,audio,request),daemon=True).start()
    return jobs[job_id]

@app.get('/api/rendered-videos/{filename}')
def rendered_video(filename: str):
    if len(filename)!=36 or not filename.endswith('.mp4') or any(c not in '0123456789abcdef' for c in filename[:-4]):
        raise HTTPException(400,'Invalid filename')
    path=DATA/'outputs'/filename
    if not path.exists(): raise HTTPException(404,'Not found')
    return FileResponse(path,media_type='video/mp4',filename=filename)

@app.post('/api/youtube/import')
def youtube_import():
    raise HTTPException(501, 'Authorized YouTube import is planned, not yet implemented.')

class AudioEditRequest(AudioEdit):
    source: str = Field(pattern=r'^(output|upload|sample):[0-9a-f]{32}$')
    save_as: str = Field(default='new', pattern=r'^(new|replace)$')
    name: str = Field(default='', max_length=120)

@app.post('/api/audio/edit')
def edit_audio(request: AudioEditRequest):
    """Apply trims, fades and cleanup to a recording, writing a new file.

    Narration outputs become a new output (usable in Video Studio). Uploaded references
    become a new uploaded voice, or replace the original when save_as is 'replace'.
    Designed-voice samples always become a new uploaded voice.
    """
    if not shutil.which('ffmpeg'): raise HTTPException(503,'FFmpeg is required')
    kind, key = request.source.split(':')
    if kind == 'output':
        source = DATA/'outputs'/f'{key}.wav'
    elif kind == 'upload':
        source = upload_path(key)
    else:
        source = library.sample_file(key)
    if not source or not source.is_file(): raise HTTPException(404,'Audio not found')
    new_id = uuid4().hex
    target = (DATA/'outputs' if kind == 'output' else DATA/'voices')/f'{new_id}.wav'
    try:
        render(source, target, request)
    except ValueError as exc:
        raise HTTPException(422, str(exc))
    except subprocess.CalledProcessError as exc:
        target.unlink(missing_ok=True)
        raise HTTPException(400, f'Audio edit failed: {(exc.stderr or "").strip()[-300:]}')
    if kind == 'output':
        jobs[new_id] = {'status':'complete','progress':100,'message':'Edited narration ready',
                        'download_url':f'/api/outputs/{new_id}.wav','edited_from':key}
        return jobs[new_id]
    meta = voice_meta()
    if kind == 'upload' and request.save_as == 'replace':
        target.replace(source)
        return {'voice_id':key, 'filename':meta.get(key,{}).get('name',key), 'category':meta.get(key,{}).get('category','')}
    base = meta.get(key,{}) if kind == 'upload' else {'name':'Edited sample','category':''}
    meta[new_id] = {'name':request.name.strip() or base.get('name','Voice')+' (edited)', 'category':base.get('category',''), 'origin':'edited'}
    save_voice_meta(meta)
    return {'voice_id':new_id, 'filename':meta[new_id]['name'], 'category':meta[new_id]['category']}


class UpdateInstallRequest(BaseModel):
    commit_sha: str = Field(pattern=r'^[0-9a-f]{40}$')

@app.get('/api/updates/check')
def check_updates():
    if os.environ.get('HUMPERDINCK_NATIVE_PACKAGE') == '1':
        return {'available': False, 'reason': 'Unsigned native test builds do not yet support binary updates',
                'changed_files': [], 'removed_files': [], 'can_install': False}
    try:
        result = updater.check()
    except updater.UpdateError as exc:
        raise HTTPException(503, str(exc))
    result.pop('file_hashes', None)
    result['can_install'] = bool(os.environ.get('HUMPERDINCK_LAUNCHER_PID'))
    return result

@app.post('/api/updates/install')
def install_update(request: UpdateInstallRequest):
    """Download and verify the approved commit, then ask the launcher to install and restart."""
    if os.environ.get('HUMPERDINCK_NATIVE_PACKAGE') == '1':
        raise HTTPException(501, 'Native binary updates are not yet available in unsigned test builds')
    if not os.environ.get('HUMPERDINCK_LAUNCHER_PID'):
        raise HTTPException(409, 'Start Humperdinck with start.sh (or start.cmd) to install updates from the app')
    if engines.pool.busy:
        raise HTTPException(409, 'Wait for the current generation to finish before updating')
    try:
        update = updater.check()
        if update['commit_sha'] != request.commit_sha:
            raise HTTPException(409, 'A newer update was published; check again to review it')
        if not update['available']:
            return {'installing': False, 'message': 'Already up to date'}
        updater.stage(update)
    except updater.UpdateError as exc:
        raise HTTPException(503, str(exc))
    (updater.STATE / 'restart').touch()  # the launcher polls for this, stops the servers and installs
    return {'installing': True, 'message': 'Update downloaded and verified. Installing and restarting...'}


class ModelChoice(BaseModel):
    role: str = Field(pattern=r'^(design|clone|preset)$')
    engine: str
    model: str

class ModelInstall(BaseModel):
    engine: str
    model: str | None = None

install_lock = Lock()

@app.get('/api/models')
def list_models():
    """Every engine and model, whether it runs here, and what is installed and selected."""
    memory = catalog.total_memory_gb()
    engines_out = []
    for engine_id, engine in catalog.ENGINES.items():
        supported = catalog.supported(engine_id)
        engines_out.append({
            'id': engine_id, 'label': engine['label'], 'roles': engine['roles'], 'note': engine['note'],
            'supported': supported, 'installed': supported and engines.installed(engine_id),
            'native_installable': (not (os.environ.get('HUMPERDINCK_NATIVE_PACKAGE') == '1')
                                   or engine_id == 'kokoro'
                                   or (engine_id in ('qwen-mlx','qwen-torch','piper') and supported)),
            'platforms': [{'darwin': 'macOS', 'win32': 'Windows', 'linux': 'Linux'}[p] for p in engine['platforms']],
            'requires_apple_silicon': bool(engine.get('requires_apple_silicon')),
            'models': [{'id': model_id, **info, 'downloaded': catalog.downloaded(model_id),
                        'tight': bool(memory and info['memory_gb'] > memory * 0.6)}
                       for model_id, info in engine['models'].items()]})
    return {'platform': catalog.platform_name(), 'memory_gb': round(memory, 1) if memory else None,
            'shared_models': str(catalog.shared_models.model_home()),
            'native_package': os.environ.get('HUMPERDINCK_NATIVE_PACKAGE') == '1',
            'ffmpeg_available': bool(shutil.which('ffmpeg')),
            'selected': settings.load(), 'engines': engines_out,
            'installing': next((j for j in [jobs.get(installing.get('job'))] if j and j.get('status') in ('queued','running')), None),
            'recent_install': jobs.get(installing.get('job')) if installing.get('job') else None}

@app.put('/api/models/selection')
def choose_model(request: ModelChoice):
    try:
        return settings.save(request.role, request.engine, request.model)
    except ValueError as exc:
        raise HTTPException(422, str(exc))

installing = {}

def run_install(job_id, command):
    job = jobs[job_id]
    log = []
    try:
        job.update(status='running', message='Starting installer')
        process = subprocess.Popen(command, cwd=ROOT, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True)
        for line in process.stdout:
            line = line.rstrip()
            log.append(line); del log[:-40]
            if line.startswith('STEP '):
                job.update(message=line[5:])
        process.wait()
        if process.returncode:
            raise RuntimeError(next((l for l in reversed(log) if l.strip()), f'exit code {process.returncode}'))
        engines.forget(job['engine'])
        # Check model files before reporting a successful repair.
        if job.get('model') and not catalog.downloaded(job['model']):
            raise RuntimeError('Model download is incomplete or speech-tokenizer files are missing. Check the installer log.')
        job.update(status='complete', progress=100,
                   message='Repair complete; model files verified. Generate a preview to test decoding.'
                   if job.get('model') and job['engine'] == 'qwen-mlx'
                   else 'Installed and ready', log=log[-15:])
    except Exception as exc:
        error_text = str(exc)
        recent = "\n".join(log[-40:])
        if any(token in recent.lower() for token in ("no space left on device", "os error 28", "disk quota exceeded")):
            job.update(status='failed',
                       message="Insufficient disk space for model download. Free space on the model-cache volume and retry; incomplete Hugging Face downloads may also be using space.",
                       log=log[-15:])
        else:
            job.update(status='failed', message=f'Install failed: {error_text}', log=log[-15:])
    finally:
        install_lock.release()

class ModelDelete(BaseModel):
    engine: str
    model: str


@app.post('/api/models/delete')
def delete_model(request: ModelDelete):
    """Remove downloaded weights without uninstalling the engine or touching saved voices."""
    if request.engine not in catalog.ENGINES or request.model not in catalog.ENGINES[request.engine]['models']:
        raise HTTPException(422, 'Unknown model')
    # Keep deletion and model installation mutually exclusive, and do not remove
    # model files from underneath an active inference job.
    if not install_lock.acquire(blocking=False):
        raise HTTPException(409, 'A model installation or deletion is in progress')
    try:
        if not engine_lock.acquire(blocking=False):
            raise HTTPException(409, 'Audio generation is running. Delete the model when it finishes.')
        try:
            # The resident worker may hold the model open; unload before deleting.
            engines.pool.shutdown()
            removed = catalog.delete_downloaded_model(request.engine, request.model)
        finally:
            engine_lock.release()
    finally:
        install_lock.release()
    return {'deleted': removed, 'engine': request.engine, 'model': request.model,
            'message': 'Downloaded model files deleted.' if removed else 'No local model files found.'}


def run_native_kokoro_install(job_id):
    job = jobs[job_id]
    try:
        job.update(status='running', message='Downloading Kokoro weights into shared cache')
        native_models.download_kokoro(lambda message: job.update(message=message))
        if not catalog.downloaded('bm_george'):
            raise RuntimeError('Required Kokoro files are still incomplete')
        engines.forget('kokoro')
        job.update(status='complete',progress=100,
                   message='Kokoro is downloaded. Generate a short voice preview to test it.')
    except Exception as exc:
        job.update(status='failed', message=f'Kokoro download failed: {exc}')
    finally:
        install_lock.release()


@app.post('/api/models/install')
def install_model(request: ModelInstall):
    """Install an engine and/or download a model. Needs internet; runs in the background."""
    native = os.environ.get('HUMPERDINCK_NATIVE_PACKAGE') == '1'
    if native and request.engine != 'kokoro':
        from backend import native_runtime
        if not native_runtime.supported(request.engine):
            raise HTTPException(501, 'This engine is not supported on this operating system')
    if request.engine not in catalog.ENGINES or not catalog.supported(request.engine):
        raise HTTPException(422, 'That engine is not available on this computer')
    if request.model and request.model not in catalog.ENGINES[request.engine]['models']:
        raise HTTPException(422, 'Unknown model for this engine')
    if not install_lock.acquire(blocking=False):
        raise HTTPException(409, 'Another installation is already running')
    if native and request.engine in ('qwen-mlx', 'qwen-torch', 'piper'):
        job_id = uuid4().hex
        jobs[job_id] = {'job_id':job_id, 'status':'queued','progress':0,
                        'message':'Preparing an isolated ' + request.engine + ' runtime',
                        'engine':request.engine, 'model':request.model}
        installing['job'] = job_id
        command = [sys.executable, '--native-install-engine', request.engine]
        if request.model:
            command += ['--model', request.model]
        Thread(target=run_install, args=(job_id, command), daemon=True).start()
        return jobs[job_id]
    if native:
        voice = request.model or 'bm_george'
        if voice not in catalog.PRESET_VOICES['kokoro']:
            install_lock.release()
            raise HTTPException(422, 'Unknown Kokoro voice')
        job_id = uuid4().hex
        jobs[job_id] = {'job_id':job_id,'status':'queued','progress':0,
                        'message':'Waiting to download shared Kokoro weights',
                        'engine':'kokoro','model':voice}
        installing['job'] = job_id
        Thread(target=run_native_kokoro_install, args=(job_id,), daemon=True).start()
        return jobs[job_id]
    command = [sys.executable, str(ROOT/'scripts'/'install_engine.py'), request.engine]
    if request.model:
        command += ['--model', request.model]
    job_id = uuid4().hex
    jobs[job_id] = {'status':'queued','progress':0,'message':'Waiting to install','engine':request.engine,'model':request.model}
    installing['job'] = job_id
    Thread(target=run_install, args=(job_id, command), daemon=True).start()
    return jobs[job_id]
