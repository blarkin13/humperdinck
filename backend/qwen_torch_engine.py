"""Qwen3-TTS through the official qwen-tts package (PyTorch): Windows, Linux and Mac.

VoiceDesign models turn a description into speech; Base models clone a reference clip.
Cloning works best with the reference transcript (ref_text), which Humperdinck has for
approved designed-voice previews. Uploads and recordings have none, so only the
speaker embedding is used for them.
"""
import gc
import hashlib
from pathlib import Path

import numpy as np

from backend.engine import segments
from backend.qwen_engine import design_language
from backend.voice_seed import clone_identity, design_identity, seed_for


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


def reference_identity(reference, transcript=None):
    """Bind a reusable clone prompt to the actual local audio bytes.

    Path-only caching can silently reuse an old speaker after someone replaces
    a voice recording under the same filename. A checksum avoids stale identity.
    """
    path = Path(reference)
    digest = hashlib.sha256()
    with path.open("rb") as recording:
        for chunk in iter(lambda: recording.read(1024 * 1024), b""):
            digest.update(chunk)
    return (str(path.resolve()), digest.hexdigest(), transcript)


def cpu_reason(torch):
    """Why PyTorch is not using a GPU, in words the Models screen can show."""
    import sys
    if sys.platform == 'darwin':
        return 'PyTorch runs on the CPU on Mac. Qwen MLX uses the Apple GPU.'
    if not torch.version.cuda:
        return 'This PyTorch has no NVIDIA GPU support. Reinstall the engine in Models to get the GPU version.'
    return 'No NVIDIA GPU or driver was found.'


class QwenTorchEngine:
    def __init__(self, model_id):
        self.model_id = model_id
        self.model = None
        self.device = None
        self.prompts = {}  # (reference path, transcript) -> reusable clone prompt

    def load(self):
        if self.model is None:
            import torch
            from qwen_tts import Qwen3TTSModel
            if torch.cuda.is_available():
                # Older NVIDIA GPUs support CUDA but not BF16. Avoid crashing
                # when the engine selects BF16 on hardware without BF16 support.
                bf16 = bool(getattr(torch.cuda, 'is_bf16_supported', lambda: False)())
                device, dtype = 'cuda:0', torch.bfloat16 if bf16 else torch.float16
                self.device = {'kind': 'gpu', 'name': torch.cuda.get_device_name(0),
                               'precision': 'bf16' if bf16 else 'fp16'}
            else:
                # bf16 on CPU is slow or unsupported on many machines; MPS support is unreliable.
                device, dtype = 'cpu', torch.float32
                self.device = {'kind': 'cpu', 'name': 'CPU', 'reason': cpu_reason(torch)}
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
        identity = design_identity(description)
        parts, rate = [], None
        for i, chunk in enumerate(chunks):
            _seed_torch(seed_for(identity, chunk))
            wavs, rate = model.generate_voice_design(text=chunk, language=design_language(description), instruct=description)
            parts.append(wavs[0])
            if on_progress:
                on_progress(i + 1, len(chunks))
        self._write(parts, rate, destination)

    def clone(self, text, reference, destination, ref_text=None, on_progress=None):
        model = self.load()
        chunks = segments(text)
        if not chunks:
            raise ValueError('No narration text')
        key = reference_identity(reference, ref_text)
        if key not in self.prompts:
            # A replaced recording must never inherit the previous speaker's
            # prompt, even when the file path and transcript are unchanged.
            for old in list(self.prompts):
                if old[0] == key[0]:
                    self.prompts.pop(old, None)
            self.prompts[key] = model.create_voice_clone_prompt(
                ref_audio=str(reference), ref_text=ref_text, x_vector_only_mode=not ref_text)
        identity = clone_identity(reference, ref_text)
        parts, rate = [], None
        for i, chunk in enumerate(chunks):
            _seed_torch(seed_for(identity, chunk))
            wavs, rate = model.generate_voice_clone(text=chunk, language='Auto', voice_clone_prompt=self.prompts[key])
            parts.append(wavs[0])
            if on_progress:
                on_progress(i + 1, len(chunks))
        self._write(parts, rate, destination)

    def close(self):
        self.model = None
        self.prompts.clear()
        gc.collect()


def _seed_torch(seed):
    """Seed PyTorch sampling (CPU and CUDA) so identical requests match."""
    try:
        import torch
    except ImportError:  # test doubles run without torch
        return
    torch.manual_seed(seed)
