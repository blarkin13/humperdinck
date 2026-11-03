"""Chatterbox voice cloning adapter. Model weights download on first use."""
import os
import re
import subprocess
import tempfile
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


class VoiceEngine:
    def __init__(self):
        self.model = None
        self.device = None

    def load(self):
        if self.model is not None:
            return self.model
        import torch
        from chatterbox.tts import ChatterboxTTS
        self.device = os.environ.get('HUMPERDINCK_CHATTERBOX_DEVICE') or self.pick_device(torch)
        self.model = ChatterboxTTS.from_pretrained(device=self.device)
        return self.model

    @staticmethod
    def pick_device(torch):
        if torch.cuda.is_available():
            return 'cuda'
        if hasattr(torch.backends, 'mps') and torch.backends.mps.is_available():
            # On an 8 GB M2, MPS kept ~3.5 GB of GPU buffers on top of the model and
            # swapped heavily: 2 s of speech took 33 s, then 109-265 s on later takes.
            # CPU stayed at about 2.5 GB and 17 s once warm, so prefer it on small Macs.
            memory = os.sysconf('SC_PAGE_SIZE') * os.sysconf('SC_PHYS_PAGES')
            if memory > 16 * 2**30:
                return 'mps'
        return 'cpu'

    def synthesize(self, text, voice_path, wav_path, on_progress=None):
        import numpy as np
        import soundfile as sf
        model = self.load()
        chunks = segments(text)
        if not chunks:
            raise ValueError('No narration text')
        all_audio = []
        sample_rate = model.sr
        for i, chunk in enumerate(chunks):
            audio = model.generate(chunk, audio_prompt_path=str(voice_path))
            values = audio.detach().cpu().numpy().reshape(-1).astype('float32')
            all_audio.append(values)
            if i < len(chunks) - 1:
                all_audio.append(np.zeros(int(sample_rate * 0.24), dtype='float32'))
            if on_progress:
                on_progress(i + 1, len(chunks))
        sf.write(str(wav_path), np.concatenate(all_audio), sample_rate, subtype='PCM_16')
        return len(chunks)


def export_mp3(wav_path: Path, mp3_path: Path):
    subprocess.run(['ffmpeg', '-hide_banner', '-loglevel', 'error', '-y', '-i', str(wav_path), '-codec:a', 'libmp3lame', '-b:a', '192k', str(mp3_path)], check=True, capture_output=True, text=True)
