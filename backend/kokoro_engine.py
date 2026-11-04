"""CPU-oriented Kokoro ONNX preset narrator; does not clone arbitrary audio."""
from pathlib import Path

from backend.catalog import PRESET_VOICES, preset_path
from backend.engine import segments


class KokoroEngine:
    def __init__(self, model_id=None):
        self.model = None

    def load(self):
        if self.model is None:
            from kokoro_onnx import Kokoro
            folder = preset_path('kokoro', '')
            self.model = Kokoro(str(folder / 'kokoro-v1.0.onnx'), str(folder / 'voices-v1.0.bin'))
        return self.model

    def synthesize(self, text: str, voice: str, destination: Path, on_progress=None):
        import numpy as np
        import soundfile as sf
        if voice not in PRESET_VOICES['kokoro']:
            raise ValueError('Unknown Kokoro preset voice')
        chunks = segments(text, 220)
        if not chunks:
            raise ValueError('No narration text')
        model = self.load()
        audio, rate = [], None
        language = 'en-gb' if voice.startswith('b') else 'en-us'
        for index, chunk in enumerate(chunks):
            samples, current_rate = model.create(chunk, voice=voice, speed=1.0, lang=language)
            if rate is not None and current_rate != rate:
                raise RuntimeError('Inconsistent Kokoro sample rates')
            rate = current_rate
            audio.append(np.asarray(samples, dtype=np.float32).reshape(-1))
            if index < len(chunks) - 1:
                audio.append(np.zeros(int(rate * .15), dtype=np.float32))
            if on_progress:
                on_progress(index + 1, len(chunks))
        sf.write(str(destination), np.concatenate(audio), rate, subtype='PCM_16')
