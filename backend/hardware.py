"""What this computer can run, in the terms the setup guide needs."""
from __future__ import annotations

import platform
import shutil
import subprocess
import sys
from pathlib import Path

from backend import catalog


def nvidia_gpu() -> dict | None:
    """The first NVIDIA GPU's name and memory, or None when there is no NVIDIA driver."""
    if sys.platform == 'darwin':
        return None
    tool = shutil.which('nvidia-smi')
    if not tool and sys.platform == 'win32':
        candidate = Path(r'C:\Windows\System32\nvidia-smi.exe')
        tool = str(candidate) if candidate.is_file() else None
    if not tool:
        return None
    try:
        result = subprocess.run([tool, '--query-gpu=name,memory.total', '--format=csv,noheader,nounits'],
                                capture_output=True, text=True, timeout=10)
        name, memory = result.stdout.strip().splitlines()[0].rsplit(',', 1)
        return {'name': name.strip(), 'memory_gb': round(int(memory.strip()) / 1024, 1)}
    except (OSError, subprocess.SubprocessError, ValueError, IndexError):
        return None


def summary() -> dict:
    from backend import media_tools
    media_tools.configure()
    memory = catalog.total_memory_gb()
    return {
        'os': {'darwin': 'macOS', 'win32': 'Windows'}.get(sys.platform, 'Linux'),
        'apple_silicon': catalog.MAC_ARM,
        'nvidia': nvidia_gpu(),
        'memory_gb': round(memory, 1) if memory else None,
        'machine': platform.machine(),
        'ffmpeg': bool(shutil.which('ffmpeg') and shutil.which('ffprobe')),
    }
