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

    def synthesize(self, text: str, voice: str, destination: Path, on_progress=None, speed=1.0):
        import numpy as np
        import soundfile as sf
        if voice not in PRESET_VOICES['kokoro']:
            raise ValueError('Unknown Kokoro preset voice')
        chunks = segments(text, 220)
        if not chunks:
            raise ValueError('No narration text')
        model = self.load()
        audio, rate = [], None
        # v1.0 Kokoro uses distinct phoneme sets across languages. Never
        # phonemize all voices as American English.
        language = {
            'a': 'en-us', 'b': 'en-gb', 'e': 'es', 'f': 'fr-fr',
            'h': 'hi', 'i': 'it', 'p': 'pt-br',
        }.get(voice[0])
        g2p = None
        if voice[0] == 'j':
            try:
                from misaki.ja import JAG2P
            except ImportError as exc:
                raise RuntimeError('Japanese Kokoro voices need misaki-fork[ja]. Reinstall the Kokoro engine in Models.') from exc
            g2p = JAG2P()
        elif voice[0] == 'z':
            try:
                from misaki.zh import ZHG2P
            except ImportError as exc:
                raise RuntimeError('Mandarin Kokoro voices need misaki-fork[zh]. Reinstall the Kokoro engine in Models.') from exc
            g2p = ZHG2P()
        for index, chunk in enumerate(chunks):
            if g2p is not None:
                phonemes, _ = g2p(chunk)
                samples, current_rate = model.create(phonemes, voice=voice, speed=speed, is_phonemes=True)
            else:
                samples, current_rate = model.create(chunk, voice=voice, speed=speed, lang=language)
            if rate is not None and current_rate != rate:
                raise RuntimeError('Inconsistent Kokoro sample rates')
            rate = current_rate
            audio.append(np.asarray(samples, dtype=np.float32).reshape(-1))
            if index < len(chunks) - 1:
                audio.append(np.zeros(int(rate * .15), dtype=np.float32))
            if on_progress:
                on_progress(index + 1, len(chunks))
        sf.write(str(destination), np.concatenate(audio), rate, subtype='PCM_16')
