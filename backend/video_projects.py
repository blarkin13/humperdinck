"""Video Studio projects: a picture track, narration cues placed in time, and sound.

A project is JSON stored in DATA/video-projects. The picture track is a list of
clips (videos, still images or plain colour cards) played one after another.
Narration cues are generated audio placed at a start time. Rendering builds a
single FFmpeg command (``render_command``) so every step stays inspectable.
"""
from __future__ import annotations

import json
import re
import time

from backend import audio_fx
from pathlib import Path
from uuid import uuid4

ASPECTS = {'16:9': (1920, 1080), '9:16': (1080, 1920), '1:1': (1080, 1080), '4:5': (1080, 1350)}
FPS = 30
RATE = 48000


def new_project(name='Untitled video'):
    return {'id': uuid4().hex, 'name': name, 'aspect': '16:9', 'clips': [], 'cues': [],
            'sound': {'keep_original': True, 'duck': True, 'original_volume': 1.0, 'duck_volume': 0.25,
                      'music_id': None, 'music_volume': 0.18, 'fade': True},
            'desk': audio_fx.default_desk(),
            'created': time.time(), 'updated': time.time()}


def clip_length(clip):
    if clip['type'] == 'video':
        end = clip.get('trim_end') or clip.get('duration') or 0
        return max(0.1, float(end) - float(clip.get('trim_start') or 0))
    return max(0.5, float(clip.get('duration') or 4))


def cue_speed(cue):
    try:
        return max(0.5, min(2.0, float(cue.get('speed') or 1)))
    except (TypeError, ValueError):
        return 1.0


def cue_length(cue):
    return float(cue.get('length') or 0) / cue_speed(cue)


def cue_end(cue):
    return float(cue.get('start') or 0) + cue_length(cue)


def total_length(project):
    picture = sum(clip_length(c) for c in project['clips'])
    spoken = max((cue_end(c) for c in project['cues'] if c.get('audio')), default=0)
    return max(picture, spoken)


class Store:
    def __init__(self, folder: Path):
        self.folder = folder
        folder.mkdir(parents=True, exist_ok=True)

    def path(self, project_id):
        if not re.fullmatch(r'[0-9a-f]{32}', project_id or ''):
            raise KeyError(project_id)
        return self.folder / f'{project_id}.json'

    def list(self):
        found = []
        for path in self.folder.glob('*.json'):
            try:
                p = json.loads(path.read_text())
            except (OSError, ValueError):
                continue
            found.append({'id': p['id'], 'name': p.get('name', ''), 'updated': p.get('updated', 0),
                          'clips': len(p.get('clips', [])), 'cues': len(p.get('cues', [])),
                          'length': round(total_length(p), 1)})
        return sorted(found, key=lambda p: -p['updated'])

    def get(self, project_id):
        try:
            return json.loads(self.path(project_id).read_text())
        except (KeyError, OSError, ValueError):
            return None

    def save(self, project):
        project['updated'] = time.time()
        path = self.path(project['id'])
        temp = path.with_suffix('.tmp')
        temp.write_text(json.dumps(project, indent=2))
        temp.replace(path)
        return project

    def delete(self, project_id):
        try:
            path = self.path(project_id)
        except KeyError:
            return False
        if not path.is_file():
            return False
        path.unlink()
        return True


def _fmt(seconds):
    return f'{seconds:.3f}'


def render_command(project, resolve, output: Path, ffmpeg='ffmpeg', video_args=None, voice=None):
    """Build the FFmpeg command for a project.

    ``resolve(kind, id)`` returns a Path for 'video', 'image', 'audio' (a cue's
    generated narration) and 'music' (a sound-library file), or raises.
    ``voice(cue, path)`` returns the cue's audio with the sound desk applied
    (see audio_fx.process); without it the desk's tone runs in the graph.
    """
    width, height = ASPECTS.get(project.get('aspect'), ASPECTS['16:9'])
    sound = project.get('sound') or {}
    cues = [c for c in project['cues'] if c.get('audio')]
    clips = list(project['clips'])
    picture = sum(clip_length(c) for c in clips)
    length = total_length(project)
    if length <= 0:
        raise ValueError('Add a video, an image or a narration cue first')
    if length - picture > 0.05:
        # Narration runs past the pictures: hold on a dark card until it ends.
        clips.append({'type': 'color', 'color': '#000000', 'duration': length - picture})

    inputs, video_parts, audio_parts = [], [], []
    keep = bool(sound.get('keep_original', True))

    def add_input(*args):
        inputs.extend(args)
        return len([a for a in inputs if a == '-i']) - 1

    for i, clip in enumerate(clips):
        seconds = clip_length(clip)
        frames = max(1, round(seconds * FPS))
        fit = (f'scale={width}:{height}:force_original_aspect_ratio=decrease,'
               f'pad={width}:{height}:(ow-iw)/2:(oh-ih)/2:color=black')
        cover = f'scale={width}:{height}:force_original_aspect_ratio=increase,crop={width}:{height}'
        if clip['type'] == 'video':
            index = add_input('-ss', _fmt(float(clip.get('trim_start') or 0)), '-t', _fmt(seconds),
                              '-i', str(resolve('video', clip['source_id'])))
            video_parts.append(f'[{index}:v]{fit},setsar=1,fps={FPS},format=yuv420p,trim=duration={_fmt(seconds)},setpts=PTS-STARTPTS[v{i}]')
            if keep and clip.get('has_audio'):
                volume = float(clip.get('volume', 1.0))
                audio_parts.append(f'[{index}:a]aresample={RATE},aformat=channel_layouts=stereo,volume={volume:.2f},'
                                   f'apad,atrim=duration={_fmt(seconds)},asetpts=PTS-STARTPTS[a{i}]')
            else:
                audio_parts.append(f'anullsrc=r={RATE}:cl=stereo,atrim=duration={_fmt(seconds)}[a{i}]')
            continue
        if clip['type'] == 'image':
            index = add_input('-i', str(resolve('image', clip['source_id'])))
            if clip.get('motion', True):
                # A slow push-in (Ken Burns); upscaling first keeps the zoom smooth.
                video_parts.append(f'[{index}:v]{cover},scale={width * 2}:{height * 2},'
                                   f"zoompan=z='1+0.08*on/{frames}':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)'"
                                   f':d={frames}:s={width}x{height}:fps={FPS},setsar=1,format=yuv420p[v{i}]')
            else:
                video_parts.append(f'[{index}:v]{cover},setsar=1,loop=loop={frames - 1}:size=1:start=0,'
                                   f'fps={FPS},trim=end_frame={frames},format=yuv420p[v{i}]')
        else:
            color = re.sub(r'[^0-9a-fA-F]', '', str(clip.get('color') or '000000'))[:6] or '000000'
            index = add_input('-f', 'lavfi', '-t', _fmt(seconds), '-i', f'color=c=0x{color}:s={width}x{height}:r={FPS}')
            video_parts.append(f'[{index}:v]setsar=1,format=yuv420p[v{i}]')
        audio_parts.append(f'anullsrc=r={RATE}:cl=stereo,atrim=duration={_fmt(seconds)}[a{i}]')

    graph = video_parts + audio_parts
    pairs = ''.join(f'[v{i}][a{i}]' for i in range(len(clips)))
    graph.append(f'{pairs}concat=n={len(clips)}:v=1:a=1[vcat][orig]')
    video_out = 'vcat'
    if sound.get('fade', True) and length > 2:
        graph.append(f'[vcat]fade=t=in:st=0:d=0.5,fade=t=out:st={_fmt(length - 0.6)}:d=0.6[vfade]')
        video_out = 'vfade'

    # Lower the original sound (and music) while someone is speaking.
    spans = [(float(c['start']), cue_end(c)) for c in cues]
    def ducked(label, normal, low, out):
        if sound.get('duck', True) and spans:
            speaking = '+'.join(f'between(t,{_fmt(max(0, s - 0.15))},{_fmt(e + 0.25)})' for s, e in spans)
            graph.append(f"[{label}]volume='if(gt({speaking},0),{low:.3f},{normal:.3f})':eval=frame[{out}]")
        else:
            graph.append(f'[{label}]volume={normal:.3f}[{out}]')

    original = float(sound.get('original_volume', 1.0))
    ducked('orig', original, original * float(sound.get('duck_volume', 0.25)), 'bed')
    mix = ['[bed]']
    for k, cue in enumerate(cues):
        cue_path = resolve('audio', cue['audio'])
        if voice:
            cue_path = voice(cue, cue_path)
        index = add_input('-i', str(cue_path))
        delay = round(float(cue['start']) * 1000)
        volume = float(cue.get('volume', 1.0))
        desk = '' if voice else audio_fx.chain(project.get('desk'), cue.get('gain', 0), cue_speed(cue))
        desk = desk + ',' if desk else ''
        graph.append(f'[{index}:a]{desk}aresample={RATE},aformat=channel_layouts=stereo,volume={volume:.2f},adelay={delay}|{delay}[n{k}]')
        mix.append(f'[n{k}]')
    if sound.get('music_id'):
        index = add_input('-stream_loop', '-1', '-i', str(resolve('music', sound['music_id'])))
        music = float(sound.get('music_volume', 0.18))
        graph.append(f'[{index}:a]aresample={RATE},aformat=channel_layouts=stereo,atrim=duration={_fmt(length)}[mraw]')
        ducked('mraw', music, music * 0.45, 'music')
        mix.append('[music]')
    graph.append(f"{''.join(mix)}amix=inputs={len(mix)}:duration=first:normalize=0,atrim=duration={_fmt(length)}[mixed]")
    audio_out = 'mixed'
    if sound.get('fade', True) and length > 2:
        graph.append(f'[mixed]afade=t=in:st=0:d=0.3,afade=t=out:st={_fmt(length - 0.6)}:d=0.6[afinal]')
        audio_out = 'afinal'

    return [ffmpeg, '-hide_banner', '-loglevel', 'error', '-y', *inputs,
            '-filter_complex', ';'.join(graph), '-map', f'[{video_out}]', '-map', f'[{audio_out}]',
            *(video_args or ['-c:v', 'libx264', '-preset', 'veryfast', '-crf', '21']),
            '-r', str(FPS), '-c:a', 'aac', '-b:a', '192k', '-movflags', '+faststart',
            '-t', _fmt(length), str(output)]


def _srt_time(seconds):
    ms = round(seconds * 1000)
    return f'{ms // 3600000:02d}:{ms // 60000 % 60:02d}:{ms // 1000 % 60:02d},{ms % 1000:03d}'


def captions(project):
    """SubRip captions: each cue is split into sentences, timed by their share of its words."""
    entries = []
    for cue in sorted((c for c in project['cues'] if c.get('audio') and c.get('text')), key=lambda c: c['start']):
        text = re.sub(r'\[[^\]]*\]', '', cue['text']).strip()
        parts = [p.strip() for p in re.split(r'(?<=[.!?])\s+', text) if p.strip()] or [text]
        words = sum(len(p.split()) for p in parts) or 1
        at, length = float(cue['start']), cue_length(cue)
        for part in parts:
            span = length * len(part.split()) / words
            entries.append((at, at + span, part))
            at += span
    return ''.join(f'{n}\n{_srt_time(s)} --> {_srt_time(e)}\n{t}\n\n' for n, (s, e, t) in enumerate(entries, 1))
