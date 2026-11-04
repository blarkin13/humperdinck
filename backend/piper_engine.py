"""Piper ONNX CPU narration using a fixed downloaded preset voice per worker."""
import wave
from pathlib import Path

from backend.catalog import PRESET_VOICES, preset_path
from backend.engine import segments


class PiperEngine:
    def __init__(self, model_id):
        if model_id not in PRESET_VOICES['piper']:
            raise ValueError('Unknown Piper preset voice')
        self.model_id = model_id
        self.voice = None

    def load(self):
        if self.voice is None:
            from piper import PiperVoice
            self.voice = PiperVoice.load(str(preset_path('piper', self.model_id) / (self.model_id + '.onnx')), use_cuda=False)
        return self.voice

    def synthesize(self, text: str, voice: str, destination: Path, on_progress=None):
        if voice != self.model_id:
            raise ValueError('Preset voice does not match loaded Piper model')
        chunks = segments(text, 400)
        if not chunks:
            raise ValueError('No narration text')
        model = self.load()
        with wave.open(str(destination), 'wb') as wav:
            format_set = False
            for i, text_chunk in enumerate(chunks):
                wrote = False
                for audio in model.synthesize(text_chunk):
                    if not format_set:
                        wav.setnchannels(audio.sample_channels)
                        wav.setsampwidth(audio.sample_width)
                        wav.setframerate(audio.sample_rate)
                        format_set = True
                    wav.writeframes(audio.audio_int16_bytes)
                    wrote = True
                if not wrote:
                    raise RuntimeError('Piper generated no audio')
                if i < len(chunks) - 1:
                    wav.writeframes(bytes(int(model.config.sample_rate * .15) * 2))
                if on_progress:
                    on_progress(i + 1, len(chunks))
