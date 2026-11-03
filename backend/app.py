"""Local-only Voice Studio API."""
from pathlib import Path
from uuid import uuid4
from threading import Thread, Lock
import json
import shutil
import subprocess
import os
from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.responses import FileResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from backend import engines
from backend.engine import export_mp3
from backend.jobs import JobStore
from backend.qwen_engine import DEFAULT_MODEL
from backend.voice_library import VoiceLibrary, build_instruction

ROOT = Path(__file__).resolve().parent.parent
DATA = Path(os.environ.get('VOICE_STUDIO_DATA', ROOT / 'data'))
for folder in ('voices', 'outputs', 'videos', 'projects'):
    (DATA / folder).mkdir(parents=True, exist_ok=True)
app = FastAPI(title='Local Voice Studio', version='0.2.0')
app.add_middleware(CORSMiddleware, allow_origins=['http://localhost:5173','http://127.0.0.1:5173'], allow_methods=['*'], allow_headers=['*'])
engine_lock = Lock()
jobs = JobStore(DATA / 'jobs.sqlite3')
library = VoiceLibrary(DATA)

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
    engine: str = 'chatterbox'
    format: str = 'mp3'
    designed_voice_id: str = ''
    designed_version: int | None = None
    designed_mode: str = 'auto'  # auto, design, or reference

@app.get('/api/health')
def health():
    installed = engines.available('chatterbox')
    qwen = engines.available('qwen')
    return {'status':'ok', 'engine':'chatterbox' if installed else 'not installed', 'qwen_mlx_installed':qwen, 'qwen_model':DEFAULT_MODEL, 'version':'0.3.0', 'ffmpeg':bool(shutil.which('ffmpeg'))}

@app.get('/api/voices')
def list_voices():
    names_path = DATA/'voices'/'names.json'
    names = json.loads(names_path.read_text()) if names_path.exists() else {}
    return [{'voice_id':p.stem, 'filename':names.get(p.stem,p.name)} for p in sorted((DATA/'voices').glob('*.wav'))]

@app.post('/api/voices')
async def upload_voice(file: UploadFile = File(...)):
    suffix = Path(file.filename or '').suffix.lower()
    if suffix not in ('.wav','.mp3','.flac','.m4a'):
        raise HTTPException(400, 'Supported formats: WAV, MP3, FLAC, M4A')
    if not shutil.which('ffmpeg'):
        raise HTTPException(503, 'FFmpeg is required to normalize voice recordings')
    raw = await file.read(30 * 1024 * 1024 + 1)
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
    names_path = DATA/'voices'/'names.json'
    names = json.loads(names_path.read_text()) if names_path.exists() else {}
    names[key] = Path(file.filename or 'Imported voice').stem
    names_path.write_text(json.dumps(names,indent=2))
    return {'voice_id':key, 'filename':names[key]}

class DesignedVoiceInput(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    description: str = Field(min_length=1, max_length=1200)
    characteristics: dict[str, int] = Field(default_factory=lambda: {'pitch':50,'rasp':50,'pace':50,'warmth':50})

class DesignedVersionInput(BaseModel):
    description: str = Field(min_length=1, max_length=1200)
    characteristics: dict[str, int]

class RenameInput(BaseModel):
    name: str = Field(min_length=1, max_length=120)

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
    if set(c) != {'pitch','rasp','pace','warmth'} or any(type(v) is not int or not 0 <= v <= 100 for v in c.values()):
        raise HTTPException(422, 'Characteristics must contain pitch, rasp, pace and warmth, each an integer from 0 to 100')

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
    return result

@app.post('/api/designed-voices', status_code=201)
def create_designed_voice(request: DesignedVoiceInput):
    check_characteristics(request.characteristics)
    return library.create(request.name.strip(),request.description.strip(),request.characteristics,DEFAULT_MODEL)

@app.get('/api/designed-voices/{voice_id}')
def get_designed_voice(voice_id: str):
    return library.get(voice_id) or _missing_voice()

def _missing_voice():
    raise HTTPException(404, 'Designed voice not found')

@app.post('/api/designed-voices/{voice_id}/versions', status_code=201)
def create_designed_version(voice_id: str, request: DesignedVersionInput):
    check_characteristics(request.characteristics)
    return library.version(voice_id,request.description.strip(),request.characteristics,DEFAULT_MODEL) or _missing_voice()

@app.post('/api/designed-voices/{voice_id}/versions/{version}/activate')
def activate_designed_version(voice_id: str, version: int):
    return library.activate(voice_id,version) or _missing_voice()

@app.patch('/api/designed-voices/{voice_id}')
def rename_designed_voice(voice_id: str, request: RenameInput):
    return library.rename(voice_id,request.name.strip()) or _missing_voice()

@app.delete('/api/designed-voices/{voice_id}')
def delete_designed_voice(voice_id: str):
    if not library.delete(voice_id): _missing_voice()
    return {'deleted':True}

@app.post('/api/designed-voices/{voice_id}/duplicate', status_code=201)
def duplicate_designed_voice(voice_id: str):
    voice = library.get(voice_id) or _missing_voice()
    version = next(v for v in voice['versions'] if v['version']==voice['active_version'])
    return library.create(voice['name']+' (copy)',version['description'],version['characteristics'],version['model_id'])

@app.post('/api/designed-voices/draft-preview')
def draft_preview(request: DraftPreviewInput):
    """Preview a voice recipe without creating a saved voice."""
    check_characteristics(request.characteristics)
    instruction = build_instruction(request.description, request.characteristics)
    if len(instruction) > 1200:
        raise HTTPException(422, 'Combined voice instruction exceeds 1200 characters')
    result = generate(GenerateRequest(text=request.text, voice_description=instruction,
                                      engine='qwen-design', format='wav'))
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
            if request.engine == 'qwen-design':
                engines.synthesize('qwen', wav, request.text, description=request.voice_description,
                    on_progress=lambda done,total: job.update(progress=round(done/total*100), message=f'Generated {done}/{total} segments'))
            else:
                reference = (library.approved_sample(request.designed_voice_id, request.designed_version)
                             if request.engine == 'designed-reference' else DATA/'voices'/f'{request.voice_id}.wav')
                if not reference or not reference.is_file():
                    raise ValueError('Approved reference audio is missing')
                engines.synthesize('chatterbox', wav, request.text, reference=reference,
                    on_progress=lambda done,total: job.update(progress=round(done/total*100), message=f'Generated {done}/{total} segments'))
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
    if request.engine not in ('chatterbox', 'qwen-design', 'designed-reference'):
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
    if request.engine == 'chatterbox' and (not request.voice_id.isalnum() or not (DATA/'voices'/f'{request.voice_id}.wav').is_file()):
        raise HTTPException(404, 'Voice profile not found')
    if request.engine == 'qwen-design':
        if not engines.available('qwen'):
            raise HTTPException(503, 'Qwen MLX engine missing: run bash install-qwen-mac.sh')
    elif not engines.available('chatterbox'):
        raise HTTPException(503, 'Chatterbox engine missing: run the voice-engine installation step')
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

@app.get('/api/outputs/{filename}')
def download_output(filename: str):
    if len(filename.split('.')[0]) != 32 or not all(c in '0123456789abcdef' for c in filename.split('.')[0]):
        raise HTTPException(400, 'Invalid filename')
    if Path(filename).suffix not in ('.wav','.mp3','.mp4'):
        raise HTTPException(400, 'Invalid format')
    path = DATA/'outputs'/filename
    if not path.is_file(): raise HTTPException(404, 'Not found')
    return FileResponse(path, filename=filename)


class NarrationBlock(BaseModel):
    text: str = Field(min_length=1, max_length=10000)
    voice_key: str = Field(min_length=1)

class MultiNarrationRequest(BaseModel):
    blocks: list[NarrationBlock] = Field(min_length=1, max_length=80)
    format: str = 'mp3'
    name: str = Field(default='Narration', max_length=120)

def resolve_voice_key(key):
    # Saved designed voices have approved audio; uploads are already normalized WAV.
    if key.startswith('design:'):
        identifier = key[7:]
        voice = library.get(identifier) or _missing_voice()
        approved = library.latest_approved(identifier)
        path = approved['path'] if approved else None
    elif key.startswith('upload:'):
        identifier = key[7:]
        if not identifier.isalnum(): raise HTTPException(400,'Invalid voice')
        path = DATA/'voices'/f'{identifier}.wav'
    else:
        raise HTTPException(400,'Unknown voice selection')
    if not path or not path.is_file():
        raise HTTPException(400,'Voice needs an approved reference recording')
    return path

def run_multi(job_id, request, references):
    job = jobs[job_id]
    try:
        import soundfile as sf
        import numpy as np
        with engine_lock:
            job.update(status='running',message='Generating narration')
            clips=[]; target_rate=24000
            for index,(block,reference) in enumerate(zip(request.blocks,references)):
                temp=DATA/'outputs'/f'{job_id}-{index}.wav'
                try:
                    engines.synthesize('chatterbox',temp,block.text,reference=reference)
                    audio,rate=sf.read(temp,dtype='float32',always_2d=False)
                    if audio.ndim==2: audio=audio.mean(axis=1)
                    if rate!=target_rate:
                        # ffmpeg resampling keeps the output uniform without scipy.
                        resampled=DATA/'outputs'/f'{job_id}-{index}-resampled.wav'
                        subprocess.run(['ffmpeg','-v','error','-y','-i',str(temp),'-ar',str(target_rate),'-ac','1',str(resampled)],check=True,timeout=120)
                        audio,_=sf.read(resampled,dtype='float32')
                        resampled.unlink(missing_ok=True)
                    clips.append(audio)
                    if index<len(references)-1: clips.append(np.zeros(int(target_rate*.3),dtype='float32'))
                finally: temp.unlink(missing_ok=True)
                job.update(progress=round((index+1)/len(references)*95),message=f'Generated block {index+1}/{len(references)}')
            wav=DATA/'outputs'/f'{job_id}.wav'
            sf.write(wav,np.concatenate(clips),target_rate,subtype='PCM_16')
            if request.format=='mp3': export_mp3(wav,DATA/'outputs'/f'{job_id}.mp3')
            job.update(status='complete',progress=100,download_url=f'/api/outputs/{job_id}.{request.format}',message='Narration ready')
    except Exception as exc:
        job.update(status='failed',message=f'{type(exc).__name__}: {exc}')

@app.post('/api/narrations')
def create_narration(request: MultiNarrationRequest):
    if request.format not in ('wav','mp3'): raise HTTPException(400,'Unsupported format')
    if request.format=='mp3' and not shutil.which('ffmpeg'): raise HTTPException(503,'FFmpeg is required')
    references=[resolve_voice_key(b.voice_key) for b in request.blocks]
    if not engines.available('chatterbox'): raise HTTPException(503,'Install the Chatterbox narration engine')
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
    return FileResponse(matches[0])

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
        command=['ffmpeg','-hide_banner','-loglevel','error','-y','-i',str(video_path),'-i',str(audio_path),'-filter_complex',filters,'-map','0:v:0','-map','[a]','-c:v','libx264','-preset','veryfast','-crf','23','-c:a','aac','-b:a','192k','-movflags','+faststart','-shortest',str(output)]
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
