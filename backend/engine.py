"""Shared narration text splitting and audio export helpers."""
import re
import subprocess
from pathlib import Path


def segments(text: str, max_chars: int = 260):
    sentences = re.split(r'(?<=[.!?])\s+|\n+', text.strip())
    result, buffer = [], ''
    for sentence in sentences:
        if not sentence.strip():
            continue
        for piece in (re.findall(r'.{1,%d}(?:\s+|$)|\S+' % max_chars, sentence.strip()) if len(sentence) > max_chars else [sentence]):
            piece = piece.strip()
            if not piece:
                continue
            if buffer and len(buffer) + len(piece) + 1 > max_chars:
                result.append(buffer)
                buffer = ''
            buffer = f'{buffer} {piece}'.strip()
    if buffer:
        result.append(buffer)
    return result


def export_mp3(wav_path: Path, mp3_path: Path):
    subprocess.run(['ffmpeg', '-hide_banner', '-loglevel', 'error', '-y', '-i', str(wav_path), '-codec:a', 'libmp3lame', '-b:a', '192k', str(mp3_path)], check=True, capture_output=True, text=True)
