"""The sound desk: tone, level and dynamics applied to generated voices.

Different voices (and different takes of one voice) come out at different
loudness and tone. The desk evens them out: an optional clean-up high-pass, a
three-band EQ, a compressor and loudness matching. ``chain`` returns an FFmpeg
audio filter string, used both on narration sections and on video cues.
"""
from __future__ import annotations

import json
import re
import subprocess
from pathlib import Path

# Seven bands (Hz): a low shelf, five peaks and a high shelf.
BANDS = (60, 150, 400, 1000, 2500, 6000, 12000)
PRESETS = {
    'natural': {'eq': [0, 0, 0, 0, 0, 0, 0], 'compress': 'off'},
    'warm': {'eq': [2, 3, 1, 0, -1, -2, -3], 'compress': 'gentle'},
    'bright': {'eq': [-1, -1, 0, 1, 2, 3, 3], 'compress': 'gentle'},
    'podcast': {'eq': [1, 2, 0, -1, 2, 2, 1], 'compress': 'gentle'},
    'radio': {'eq': [-12, -6, 2, 4, 3, -4, -12], 'compress': 'strong'},
    'deep': {'eq': [4, 5, 2, 0, -1, -1, -1], 'compress': 'gentle'},
}
COMPRESSORS = {
    'off': '',
    'gentle': 'acompressor=threshold=-20dB:ratio=2.5:attack=10:release=150:makeup=1',
    'strong': 'acompressor=threshold=-26dB:ratio=4.5:attack=5:release=120:makeup=1',
}
LOUDNESS = -18  # integrated LUFS each voice part is matched to


def default_desk():
    return {'enabled': True, 'preset': 'natural', 'level_match': True, 'cleanup': True,
            'eq': [0] * len(BANDS), 'compress': 'off'}


def eq_gains(desk):
    """Seven band gains in dB; older desks stored bass/presence/air only."""
    eq = desk.get('eq')
    if isinstance(eq, list) and len(eq) == len(BANDS):
        return [_clamp(g, -12, 12) for g in eq]
    low, mid, high = (_clamp(desk.get(k), -12, 12) for k in ('low', 'mid', 'high'))
    return [low, low, 0.0, mid, mid, high, high]


def _clamp(value, low, high, fallback=0.0):
    try:
        return max(low, min(high, float(value)))
    except (TypeError, ValueError):
        return fallback


def measure(path, ffmpeg='ffmpeg'):
    """Integrated loudness (LUFS) of a file, or None when it can't be measured."""
    try:
        run = subprocess.run([ffmpeg, '-hide_banner', '-nostats', '-i', str(path), '-af', 'loudnorm=print_format=json',
                              '-f', 'null', '-'], capture_output=True, text=True, timeout=120)
        found = re.search(r'\{[^{}]*"input_i"[^{}]*\}', run.stderr)
        value = float(json.loads(found.group(0))['input_i'])
        return value if value > -70 else None
    except (OSError, ValueError, AttributeError, KeyError, subprocess.SubprocessError):
        return None


def match_gain(desk, path, ffmpeg='ffmpeg'):
    """One steady gain (dB) that brings this part to the target loudness.

    A fixed gain per part avoids the volume riding (pumping) of dynamic
    loudness normalisation, which sounds glitchy on short speech.
    """
    desk = desk or {}
    if not desk.get('enabled', True) or not desk.get('level_match', True):
        return 0.0
    loudness = measure(path, ffmpeg)
    return 0.0 if loudness is None else max(-15.0, min(15.0, LOUDNESS - loudness))


def chain(desk=None, gain=0.0, speed=1.0, level=0.0):
    """FFmpeg filters for one voice part; '' when nothing needs to change.

    ``level`` is the loudness-matching gain from ``match_gain``."""
    filters = []
    desk = desk or {}
    if desk.get('enabled', True):
        if desk.get('cleanup', True):
            filters.append('highpass=f=75')
        for i, (freq, g) in enumerate(zip(BANDS, eq_gains(desk))):
            if not g:
                continue
            if i == 0:
                filters.append(f'bass=g={g:.1f}:f={freq}')
            elif i == len(BANDS) - 1:
                filters.append(f'treble=g={g:.1f}:f={freq}')
            else:
                filters.append(f'equalizer=f={freq}:t=q:w=1.2:g={g:.1f}')
        compressor = COMPRESSORS.get(desk.get('compress') or 'off', '')
        if compressor:
            filters.append(compressor)
    gain = _clamp(gain, -24, 12) + _clamp(level, -15, 15)
    if gain:
        filters.append(f'volume={gain:.1f}dB')
    speed = _clamp(speed, 0.5, 2.0, 1.0)
    if abs(speed - 1) > 0.001:
        filters.append(f'atempo={speed:.3f}')
    if gain > 0 or any(f.startswith(('bass', 'equalizer', 'treble', 'acompressor')) for f in filters):
        filters.append('alimiter=limit=0.95:attack=5:release=80:level=disabled')
    return ','.join(filters)


def _run(ffmpeg, source, filters, rate, output):
    subprocess.run([ffmpeg, '-v', 'error', '-y', '-i', str(source), '-af', filters,
                    '-ar', str(rate), '-ac', '1', str(output)], check=True, timeout=300)


def process(path: Path, rate: int, desk=None, gain=0.0, speed=1.0, ffmpeg='ffmpeg', output: Path | None = None):
    """Apply the desk to a mono WAV (in place, or into ``output``).

    Two steps: tone (clean-up, EQ, compression) first, then the part is
    measured and given one steady level, so matching hears the final tone.
    Returns False when nothing needed to change.
    """
    output = output or path
    tone = chain(desk)
    toned = output.with_name(output.stem + '-tone.wav')
    try:
        if tone:
            _run(ffmpeg, path, tone, rate, toned)
        source = toned if tone else path
        filters = chain({'enabled': False}, gain, speed, match_gain(desk, source, ffmpeg))
        if not filters:
            if not tone and output == path:
                return False
            filters = 'anull'
        _run(ffmpeg, source, filters, rate, output.with_name(output.stem + '-desk.wav'))
        output.with_name(output.stem + '-desk.wav').replace(output)
    finally:
        toned.unlink(missing_ok=True)
        output.with_name(output.stem + '-desk.wav').unlink(missing_ok=True)
    return True
