"""Qwen3-TTS through the official qwen-tts package (PyTorch): Windows, Linux and Mac.

VoiceDesign models turn a description into speech; Base models clone a reference clip.
Cloning works best with the reference transcript (ref_text), which Humperdinck has for
approved designed-voice previews. Uploads and recordings have none, so only the
speaker embedding is used for them.
"""
import gc

import numpy as np

from backend.engine import segments


def local_path(model_id):
    """The model's folder in the local cache, when it is there.

    Loading by repo name makes transformers ask the Hugging Face API whether the model is
    a Mistral model (while loading the tokenizer), and that call ignores offline mode.
    Loading from a folder skips it.
    """
    from huggingface_hub import snapshot_download
    try:
        return snapshot_download(model_id, local_files_only=True)
    except Exception:
        return model_id  # not cached: let from_pretrained download it (online mode)


class QwenTorchEngine:
    def __init__(self, model_id):
        self.model_id = model_id
        self.model = None
        self.prompts = {}  # (reference path, transcript) -> reusable clone prompt

    def load(self):
        if self.model is None:
            import torch
            from qwen_tts import Qwen3TTSModel
            if torch.cuda.is_available():
                device, dtype = 'cuda:0', torch.bfloat16
            else:
                # bf16 on CPU is slow or unsupported on many machines; MPS support is unreliable.
                device, dtype = 'cpu', torch.float32
            self.model = Qwen3TTSModel.from_pretrained(local_path(self.model_id), device_map=device, dtype=dtype)
        return self.model

    def _write(self, parts, rate, destination):
        import soundfile as sf
        audio = []
        for i, part in enumerate(parts):
            audio.append(np.asarray(part, dtype=np.float32).reshape(-1))
            if i < len(parts) - 1:
                audio.append(np.zeros(int(rate * 0.24), dtype=np.float32))
        sf.write(str(destination), np.concatenate(audio), rate, subtype='PCM_16')

    def design(self, text, description, destination, on_progress=None):
        model = self.load()
        chunks = segments(text, 600)
        if not chunks:
            raise ValueError('No text supplied')
        parts, rate = [], None
        for i, chunk in enumerate(chunks):
            wavs, rate = model.generate_voice_design(text=chunk, language='Auto', instruct=description)
            parts.append(wavs[0])
            if on_progress:
                on_progress(i + 1, len(chunks))
        self._write(parts, rate, destination)

    def clone(self, text, reference, destination, ref_text=None, on_progress=None):
        model = self.load()
        chunks = segments(text)
        if not chunks:
            raise ValueError('No narration text')
        key = (str(reference), ref_text)
        if key not in self.prompts:
            # Build the reference prompt once and reuse it for every segment and job.
            self.prompts[key] = model.create_voice_clone_prompt(
                ref_audio=str(reference), ref_text=ref_text, x_vector_only_mode=not ref_text)
        parts, rate = [], None
        for i, chunk in enumerate(chunks):
            wavs, rate = model.generate_voice_clone(text=chunk, language='Auto', voice_clone_prompt=self.prompts[key])
            parts.append(wavs[0])
            if on_progress:
                on_progress(i + 1, len(chunks))
        self._write(parts, rate, destination)

    def close(self):
        self.model = None
        self.prompts.clear()
        gc.collect()
