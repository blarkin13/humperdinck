"""Experimental MLX-Audio Qwen3 VoiceDesign adapter (Apple Silicon)."""
import gc
import os
import re
from pathlib import Path

# 8-bit quantization reduces weight memory, but generation can still exhaust an
# 8 GB Mac's unified memory. Override HUMPERDINCK_QWEN_MODEL to try other variants.
DEFAULT_MODEL = os.environ.get('HUMPERDINCK_QWEN_MODEL', 'mlx-community/Qwen3-TTS-12Hz-1.7B-VoiceDesign-8bit')


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


def design_language(description: str) -> str:
    """Set English when an explicitly English-language regional accent is requested.

    Qwen's automatic language inference can otherwise compete with the accent
    instruction. This selects the language, not a guaranteed regional accent.
    """
    import re
    english_accents = r'\b(british|english accent|received pronunciation|scottish|irish|australian|canadian|american|new zealand|south african)\b'
    return 'english' if re.search(english_accents, description, re.IGNORECASE) else 'auto'


class QwenVoiceDesigner:
    def __init__(self, model_id=DEFAULT_MODEL):
        self.model_id = model_id
        self.model = None

    def load(self):
        # A long-lived worker keeps the model between jobs; the worker exiting frees it.
        if self.model is None:
            from mlx_audio.tts.utils import load_model
            model = load_model(self.model_id)
            # Some mlx-audio versions log a decoder-loading error but return a
            # partially initialized model. Detect it here rather than failing
            # later with the cryptic "Speech tokenizer not loaded" exception.
            if getattr(model, 'speech_tokenizer', None) is None:
                raise RuntimeError(
                    f'Qwen MLX speech tokenizer is missing or failed to initialize for {self.model_id}. '
                    'In Humperdinck > Models, download this model again to repair missing '
                    'speech_tokenizer/config.json and speech_tokenizer/model.safetensors. '
                    'If the model is fully downloaded, update/reinstall the Qwen MLX engine '
                    'in Models and restart Humperdinck. The terminal output may show the '
                    'underlying decoder load error.'
                )
            self.model = model
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
                # Current mlx-audio Qwen VoiceDesign exposes generate_voice_design,
                # not the generic generate entrypoint used by Base voice clones.
                if hasattr(model, 'generate_voice_design'):
                    generated = model.generate_voice_design(text=chunk, instruct=description, language='English')
                else:
                    generated = model.generate(text=chunk, instruct=description, lang_code=design_language(description))
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


class QwenBaseCloner:
    """Use MLX Qwen3-TTS Base for approved-reference voice cloning on Mac."""

    def __init__(self, model_id: str):
        if '-Base-' not in model_id:
            raise ValueError('Qwen voice cloning requires an MLX Base model')
        self.model_id = model_id
        self.model = None

    def load(self):
        if self.model is None:
            from mlx_audio.tts.utils import load_model
            model = load_model(self.model_id)
            if getattr(model, 'speech_tokenizer', None) is None:
                raise RuntimeError('Qwen MLX Base audio decoder did not load. Reinstall or repair this model in Models.')
            self.model = model
        return self.model

    def synthesize(self, text: str, reference: Path, destination: Path,
                   ref_text: str | None = None, on_progress=None):
        import numpy as np
        import soundfile as sf
        if not Path(reference).is_file():
            raise ValueError('Reference recording is missing')
        if not ref_text or not ref_text.strip():
            raise ValueError('Qwen MLX Base needs the exact transcript of its reference recording')
        chunks = voice_segments(text)
        if not chunks:
            raise ValueError('No narration text')
        model = self.load()
        samples = []
        rate = None
        for index, chunk in enumerate(chunks):
            # MLX Base uses reference audio + transcript; do not pass a
            # CustomVoice speaker name or VoiceDesign instruction here.
            generated = model.generate(text=chunk, ref_audio=str(reference), ref_text=ref_text)
            parts = []
            for result in generated:
                audio = result.audio
                if hasattr(audio, 'tolist'):
                    audio = audio.tolist()
                parts.append(np.asarray(audio, dtype=np.float32).reshape(-1))
                current_rate = getattr(result, 'sample_rate', None) or getattr(model, 'sample_rate', None)
                if current_rate is None:
                    raise RuntimeError('MLX Base did not report a sample rate')
                if rate and rate != int(current_rate):
                    raise RuntimeError('MLX Base sample rate changed between segments')
                rate = int(current_rate)
            if not parts:
                raise RuntimeError('MLX Base produced no audio')
            samples.append(np.concatenate(parts))
            if index + 1 < len(chunks):
                samples.append(np.zeros(int(rate * 0.15), dtype=np.float32))
            if on_progress:
                on_progress(index + 1, len(chunks))
        sf.write(str(destination), np.concatenate(samples), rate, subtype='PCM_16')
