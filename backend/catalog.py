"""Speech engines and models Humperdinck can use, with platform support and the user's choice.

Two jobs need a model:
- design: turn a written voice description into a preview (Voice Library).
- clone: speak new text in the voice of a reference recording (narration, uploads,
  recordings, approved designed voices).

Each engine lives in its own virtual environment (.venv-<venv>) so their dependencies
never conflict. Sizes are the download from Hugging Face; memory is approximate RAM
(or GPU memory) while generating.
"""
import ctypes
import json
import os
import platform
import sys
from pathlib import Path

MAC_ARM = sys.platform == 'darwin' and platform.machine() == 'arm64'
ALL = ('darwin', 'win32', 'linux')

ENGINES = {
    'qwen-mlx': {
        'label': 'Qwen3-TTS (MLX)', 'venv': 'qwen', 'roles': ('design',), 'platforms': ('darwin',),
        'requires_apple_silicon': True, 'imports': ('mlx_audio',),
        'packages': ['mlx-audio', 'soundfile>=0.12', 'numpy>=1.24,<3'],
        'note': 'Fastest option on Apple Silicon Macs.',
        'models': {
            'mlx-community/Qwen3-TTS-12Hz-1.7B-VoiceDesign-4bit': {'label': '1.7B · 4-bit', 'size_gb': 2.3, 'memory_gb': 2.0, 'roles': ('design',), 'note': 'Smallest; least detail'},
            'mlx-community/Qwen3-TTS-12Hz-1.7B-VoiceDesign-6bit': {'label': '1.7B · 6-bit', 'size_gb': 2.7, 'memory_gb': 2.5, 'roles': ('design',)},
            'mlx-community/Qwen3-TTS-12Hz-1.7B-VoiceDesign-8bit': {'label': '1.7B · 8-bit', 'size_gb': 3.1, 'memory_gb': 3.0, 'roles': ('design',), 'note': 'Lower weight memory; 8 GB Macs may still run out of memory'},
            'mlx-community/Qwen3-TTS-12Hz-1.7B-VoiceDesign-bf16': {'label': '1.7B · full precision', 'size_gb': 4.5, 'memory_gb': 4.5, 'roles': ('design',), 'note': 'Most detail; needs 16 GB+ to be comfortable'},
        },
    },
    'qwen-torch': {
        'label': 'Qwen3-TTS (PyTorch)', 'venv': 'qwen-torch', 'roles': ('design', 'clone'), 'platforms': ALL,
        'imports': ('qwen_tts',), 'packages': ['qwen-tts', 'soundfile>=0.12'], 'torch': True,
        'note': 'Works on Windows, Linux and Mac. Much faster with an NVIDIA GPU.',
        'models': {
            'Qwen/Qwen3-TTS-12Hz-1.7B-VoiceDesign': {'label': '1.7B VoiceDesign', 'size_gb': 4.5, 'memory_gb': 7.0, 'gpu_memory_gb': 4.5, 'roles': ('design',)},
            'Qwen/Qwen3-TTS-12Hz-0.6B-Base': {'label': '0.6B voice clone', 'size_gb': 2.5, 'memory_gb': 3.5, 'gpu_memory_gb': 2.5, 'roles': ('clone',), 'note': 'Lighter cloning model'},
            'Qwen/Qwen3-TTS-12Hz-1.7B-Base': {'label': '1.7B voice clone', 'size_gb': 4.5, 'memory_gb': 7.0, 'gpu_memory_gb': 4.5, 'roles': ('clone',), 'note': 'Keeps accents from designed voices best'},
        },
    },
    'chatterbox': {
        'label': 'Chatterbox', 'venv': 'chatterbox', 'roles': ('clone',), 'platforms': ALL,
        'imports': ('chatterbox.tts',), 'packages': ['chatterbox-tts>=0.1,<1', 'soundfile>=0.12,<1'], 'torch': True,
        'note': 'English voice cloning from a short clip. Works on every platform.',
        'models': {
            'ResembleAI/chatterbox': {'label': 'Chatterbox', 'size_gb': 3.0, 'memory_gb': 2.5, 'gpu_memory_gb': 3.0, 'roles': ('clone',), 'note': 'Default narration model'},
        },
    },
}


def supported(engine_id):
    engine = ENGINES[engine_id]
    return sys.platform in engine['platforms'] and (MAC_ARM or not engine.get('requires_apple_silicon'))


def defaults():
    design = ('qwen-mlx', 'mlx-community/Qwen3-TTS-12Hz-1.7B-VoiceDesign-8bit') if MAC_ARM else \
             ('qwen-torch', 'Qwen/Qwen3-TTS-12Hz-1.7B-VoiceDesign')
    return {'design': {'engine': design[0], 'model': design[1]},
            'clone': {'engine': 'chatterbox', 'model': 'ResembleAI/chatterbox'}}


def model_info(engine_id, model_id):
    engine = ENGINES.get(engine_id)
    return engine and engine['models'].get(model_id)


def validate(role, engine_id, model_id):
    info = model_info(engine_id, model_id)
    if not info or role not in info['roles']:
        raise ValueError(f'{model_id} cannot be used for {role}')
    if not supported(engine_id):
        raise ValueError(f"{ENGINES[engine_id]['label']} is not available on this computer")


class Settings:
    """The chosen model for each role, stored in data/settings.json."""

    def __init__(self, path: Path):
        self.path = path

    def load(self):
        try:
            saved = json.loads(self.path.read_text())
        except (OSError, ValueError):
            saved = {}
        result = defaults()
        for role in result:
            choice = (saved.get('models') or {}).get(role) or {}
            try:
                validate(role, choice.get('engine'), choice.get('model'))
                result[role] = {'engine': choice['engine'], 'model': choice['model']}
            except (ValueError, KeyError, TypeError):
                pass  # unknown or unsupported here (e.g. data copied from a Mac): use the default
        # Environment overrides, mainly for scripting and tests.
        if os.environ.get('HUMPERDINCK_QWEN_MODEL') and result['design']['engine'] == 'qwen-mlx':
            result['design']['model'] = os.environ['HUMPERDINCK_QWEN_MODEL']
        return result

    def save(self, role, engine_id, model_id):
        validate(role, engine_id, model_id)
        try:
            saved = json.loads(self.path.read_text())
        except (OSError, ValueError):
            saved = {}
        saved.setdefault('models', {})[role] = {'engine': engine_id, 'model': model_id}
        temp = self.path.with_suffix('.tmp')
        temp.write_text(json.dumps(saved, indent=2))
        os.replace(temp, self.path)
        return self.load()


def hf_cache():
    if os.environ.get('HF_HUB_CACHE'):
        return Path(os.environ['HF_HUB_CACHE'])
    home = Path(os.environ.get('HF_HOME') or Path.home() / '.cache' / 'huggingface')
    return home / 'hub'


def downloaded(model_id):
    """True when the model's files are already in the local Hugging Face cache."""
    repo = hf_cache() / ('models--' + model_id.replace('/', '--'))
    snapshots = repo / 'snapshots'
    if not snapshots.is_dir():
        return False
    # An interrupted download leaves *.incomplete blobs and no weights; it must not count as downloaded.
    if any((repo / 'blobs').glob('*.incomplete')):
        return False
    weights = ('.safetensors', '.bin', '.pt', '.pth', '.npz', '.gguf')
    return any(f.name.endswith(weights) for s in snapshots.iterdir() if s.is_dir() for f in s.rglob('*'))


def total_memory_gb():
    try:
        if sys.platform == 'win32':
            class Status(ctypes.Structure):
                _fields_ = [('dwLength', ctypes.c_ulong), ('dwMemoryLoad', ctypes.c_ulong),
                            ('ullTotalPhys', ctypes.c_ulonglong), ('ullAvailPhys', ctypes.c_ulonglong),
                            ('ullTotalPageFile', ctypes.c_ulonglong), ('ullAvailPageFile', ctypes.c_ulonglong),
                            ('ullTotalVirtual', ctypes.c_ulonglong), ('ullAvailVirtual', ctypes.c_ulonglong),
                            ('ullAvailExtendedVirtual', ctypes.c_ulonglong)]
            status = Status()
            status.dwLength = ctypes.sizeof(Status)
            ctypes.windll.kernel32.GlobalMemoryStatusEx(ctypes.byref(status))
            return status.ullTotalPhys / 2**30
        return os.sysconf('SC_PAGE_SIZE') * os.sysconf('SC_PHYS_PAGES') / 2**30
    except (AttributeError, OSError, ValueError):
        return None


def platform_name():
    return {'darwin': 'macOS', 'win32': 'Windows', 'linux': 'Linux'}.get(sys.platform, sys.platform)
