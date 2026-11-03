"""Experimental MLX-Audio Qwen3 VoiceDesign adapter (Apple Silicon)."""
import gc
import re
from pathlib import Path

DEFAULT_MODEL = 'mlx-community/Qwen3-TTS-12Hz-1.7B-VoiceDesign-8bit'


def voice_segments(text, limit=600):
    """Pack complete sentences together; split long sentences at word boundaries.

    This avoids designing a new speaker for every sentence. A segment is still
    an independent generation, so use an approved reference for long scripts.
    """
    if limit < 20:
        raise ValueError('Segment limit must be at least 20 characters')
    sentences = re.split(r'(?<=[.!?])\s+|\n+', text.strip())
    chunks, current = [], ''
    for sentence in sentences:
        sentence = sentence.strip()
        while sentence:
            room = limit - len(current) - (1 if current else 0)
            if len(sentence) <= room:
                current = f'{current} {sentence}'.strip()
                break
            if current:
                chunks.append(current)
                current = ''
                continue
            split = sentence.rfind(' ', 0, limit + 1)
            if split < 20:
                split = limit
            chunks.append(sentence[:split].strip())
            sentence = sentence[split:].strip()
    if current:
        chunks.append(current)
    return chunks


class QwenVoiceDesigner:
    def __init__(self, model_id=DEFAULT_MODEL):
        self.model_id = model_id
        self.model = None

    def load(self):
        # A long-lived worker keeps the model between jobs; the worker exiting frees it.
        if self.model is None:
            from mlx_audio.tts.utils import load_model
            self.model = load_model(self.model_id)
        return self.model

    def synthesize(self, text: str, description: str, destination: Path, on_progress=None):
        import numpy as np
        import soundfile as sf
        if not description.strip():
            raise ValueError('A voice description is required')
        chunks = voice_segments(text)
        if not chunks:
            raise ValueError('No text supplied')
        model = self.load()
        samples = []
        sample_rate = None
        try:
            for index, chunk in enumerate(chunks):
                generated = model.generate(text=chunk, instruct=description)
                # MLX-Audio models can return an iterator of generation results.
                parts = []
                for result in generated:
                    audio = result.audio
                    if hasattr(audio, 'tolist'):
                        audio = audio.tolist()
                    parts.append(np.asarray(audio, dtype=np.float32).reshape(-1))
                    rate = getattr(result, 'sample_rate', None) or getattr(model, 'sample_rate', None)
                    if rate is None:
                        raise RuntimeError('Model did not report an output sample rate')
                    if sample_rate is not None and int(rate) != sample_rate:
                        raise RuntimeError('Inconsistent output sample rates')
                    sample_rate = int(rate)
                if not parts:
                    raise RuntimeError('Voice model produced no audio')
                samples.append(np.concatenate(parts))
                if index < len(chunks) - 1:
                    samples.append(np.zeros(int(sample_rate * 0.22), dtype=np.float32))
                if on_progress:
                    on_progress(index + 1, len(chunks))
            sf.write(str(destination), np.concatenate(samples), sample_rate, subtype='PCM_16')
        finally:
            del model
            gc.collect()
            # Drop MLX's buffer cache between jobs; the weights stay loaded.
            try:
                import mlx.core as mx
                mx.clear_cache()
            except (ImportError, AttributeError):
                pass
