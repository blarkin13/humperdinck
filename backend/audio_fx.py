"""The sound desk: tone, level and dynamics applied to generated voices.

Different voices (and different takes of one voice) come out at different
loudness and tone. The desk evens them out: an optional clean-up high-pass, a
three-band EQ, a compressor and loudness matching. ``chain`` returns an FFmpeg
audio filter string, used both on narration sections and on video cues.
"""
from __future__ import annotations

import subprocess
from pathlib import Path

PRESETS = {
    'natural': {'low': 0, 'mid': 0, 'high': 0, 'compress': 'off'},
    'warm': {'low': 3, 'mid': -1, 'high': -2, 'compress': 'gentle'},
    'bright': {'low': -1, 'mid': 1, 'high': 4, 'compress': 'gentle'},
    'podcast': {'low': 2, 'mid': 1, 'high': 2, 'compress': 'gentle'},
    'radio': {'low': -6, 'mid': 4, 'high': 1, 'compress': 'strong'},
    'deep': {'low': 5, 'mid': -1, 'high': -1, 'compress': 'gentle'},
}
COMPRESSORS = {
    'off': '',
    'gentle': 'acompressor=threshold=-20dB:ratio=2.5:attack=10:release=150:makeup=2',
    'strong': 'acompressor=threshold=-26dB:ratio=4.5:attack=5:release=120:makeup=4',
}
LOUDNESS = -18  # integrated LUFS each voice part is matched to


def default_desk():
    return {'enabled': True, 'preset': 'natural', 'level_match': True, 'cleanup': True,
            'low': 0, 'mid': 0, 'high': 0, 'compress': 'off'}


def _clamp(value, low, high, fallback=0.0):
    try:
        return max(low, min(high, float(value)))
    except (TypeError, ValueError):
        return fallback


def chain(desk=None, gain=0.0, speed=1.0):
    """FFmpeg filters for one voice part; '' when nothing needs to change."""
    filters = []
    desk = desk or {}
    if desk.get('enabled', True):
        if desk.get('cleanup', True):
            filters.append('highpass=f=75')
        low, mid, high = (_clamp(desk.get(k), -12, 12) for k in ('low', 'mid', 'high'))
        if low:
            filters.append(f'bass=g={low:.1f}:f=150')
        if mid:
            filters.append(f'equalizer=f=1800:t=q:w=1:g={mid:.1f}')
        if high:
            filters.append(f'treble=g={high:.1f}:f=5500')
        compressor = COMPRESSORS.get(desk.get('compress') or 'off', '')
        if compressor:
            filters.append(compressor)
        if desk.get('level_match', True):
            filters.append(f'loudnorm=I={LOUDNESS}:TP=-1.5:LRA=11')
    gain = _clamp(gain, -24, 12)
    if gain:
        filters.append(f'volume={gain:.1f}dB')
    speed = _clamp(speed, 0.5, 2.0, 1.0)
    if abs(speed - 1) > 0.001:
        filters.append(f'atempo={speed:.3f}')
    if filters:
        filters.append('alimiter=limit=0.95')
    return ','.join(filters)


def process(path: Path, rate: int, desk=None, gain=0.0, speed=1.0, ffmpeg='ffmpeg'):
    """Apply the desk to a mono WAV in place. Returns False when nothing changed."""
    filters = chain(desk, gain, speed)
    if not filters:
        return False
    temp = path.with_name(path.stem + '-desk.wav')
    try:
        subprocess.run([ffmpeg, '-v', 'error', '-y', '-i', str(path), '-af', filters,
                        '-ar', str(rate), '-ac', '1', str(temp)], check=True, timeout=300)
        temp.replace(path)
    finally:
        temp.unlink(missing_ok=True)
    return True
