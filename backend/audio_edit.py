"""Non-destructive audio edits rendered with FFmpeg.

Edits always write a new file; the source recording is never modified.
"""
import subprocess
from pathlib import Path

from pydantic import BaseModel, Field


class AudioEdit(BaseModel):
    start: float = Field(default=0, ge=0)          # seconds to keep from
    end: float | None = Field(default=None, gt=0)  # seconds to keep until (None = end of file)
    fade_in: float = Field(default=0, ge=0, le=30)
    fade_out: float = Field(default=0, ge=0, le=30)
    gain_db: float = Field(default=0, ge=-30, le=30)
    normalize: bool = False        # broadcast loudness, -16 LUFS
    denoise: bool = False          # FFT noise reduction for steady background hiss
    highpass: bool = False         # remove rumble below 80 Hz
    trim_silence: bool = False     # strip leading/trailing silence
    speed: float = Field(default=1.0, ge=0.5, le=2.0)  # pitch-preserving
    compress: bool = False         # gentle voice compressor to even out levels


def duration(path: Path) -> float:
    probe = subprocess.run(['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', str(path)],
                           capture_output=True, text=True, timeout=30, check=True)
    return float(probe.stdout.strip())


def filters(edit: AudioEdit, total: float):
    chain = []
    end = min(edit.end, total) if edit.end else total
    if edit.start >= end:
        raise ValueError('Selection is empty: start must be before end')
    if edit.start > 0 or end < total:
        chain += [f'atrim=start={edit.start:.3f}:end={end:.3f}', 'asetpts=PTS-STARTPTS']
    if edit.trim_silence:
        # Trim leading silence, reverse to trim trailing silence, then restore order.
        trim = 'silenceremove=start_periods=1:start_threshold=-50dB:start_silence=0.05'
        chain += [trim, 'areverse', trim, 'areverse']
    if edit.highpass:
        chain.append('highpass=f=80')
    if edit.denoise:
        chain.append('afftdn=nf=-25')
    if edit.compress:
        chain.append('acompressor=threshold=-20dB:ratio=3:attack=10:release=200:makeup=2')
    if edit.speed != 1.0:
        chain.append(f'atempo={edit.speed:.3f}')
    if edit.gain_db:
        chain.append(f'volume={edit.gain_db:.1f}dB')
    if edit.normalize:
        chain.append('loudnorm=I=-16:TP=-1.5:LRA=11')
    length = (end - edit.start) / edit.speed
    if edit.fade_in:
        chain.append(f'afade=t=in:st=0:d={min(edit.fade_in, length):.3f}')
    if edit.fade_out:
        d = min(edit.fade_out, length)
        if edit.trim_silence:
            # Final length is unknown after silence removal, so fade the tail via reversal.
            chain += ['areverse', f'afade=t=in:st=0:d={d:.3f}', 'areverse']
        else:
            chain.append(f'afade=t=out:st={max(0, length - d):.3f}:d={d:.3f}')
    return chain


def render(source: Path, target: Path, edit: AudioEdit, sample_rate: int = 24000):
    chain = filters(edit, duration(source))
    command = ['ffmpeg', '-hide_banner', '-loglevel', 'error', '-y', '-i', str(source)]
    if chain:
        command += ['-af', ','.join(chain)]
    command += ['-ac', '1', '-ar', str(sample_rate), '-c:a', 'pcm_s16le', str(target)]
    subprocess.run(command, check=True, capture_output=True, text=True, timeout=600)
    return target
