#!/usr/bin/env python3
"""Cross-platform installer for core development dependencies."""
import platform, shutil, subprocess, sys, venv
from pathlib import Path
root=Path(__file__).resolve().parent.parent
print('Platform:',platform.platform())
if sys.version_info < (3,11) or sys.version_info >= (3,13):
    sys.exit('Python 3.11 or 3.12 required for this starter. Install it, then rerun.')
for name in ('node','npm','ffmpeg'):
    if not shutil.which(name): print(f'WARNING: {name} missing. See docs/REQUIREMENTS.md')
if not shutil.which('npm'): sys.exit('Node.js/npm required. Install Node.js 20+ then rerun.')
venv_dir=root/'.venv'
if venv_dir.exists():
    existing=venv_dir/('Scripts/python.exe' if sys.platform=='win32' else 'bin/python')
    if existing.exists():
        result=subprocess.run([str(existing),'-c','import sys; assert (3,11) <= sys.version_info[:2] < (3,13)'],capture_output=True)
        if result.returncode != 0:
            sys.exit('Existing .venv has incompatible Python. Rename or remove .venv and rerun install.sh.')
if not venv_dir.exists(): venv.create(venv_dir,with_pip=True)
python=venv_dir/('Scripts/python.exe' if sys.platform=='win32' else 'bin/python')
subprocess.run([str(python),'-m','pip','install','-r',str(root/'backend/requirements.txt')],check=True)
subprocess.run(['npm.cmd' if sys.platform=='win32' else 'npm','install'],cwd=root/'frontend',check=True)
# Qwen gets its own environment so MLX-Audio never conflicts with Chatterbox's PyTorch stack.
if sys.platform == 'darwin' and platform.machine() == 'arm64':
    print('\nApple Silicon detected: installing Qwen MLX voice engine into .venv-qwen...')
    qwen_dir=root/'.venv-qwen'
    if not qwen_dir.exists(): venv.create(qwen_dir,with_pip=True)
    qwen_python=qwen_dir/'bin/python'
    subprocess.run([str(qwen_python), '-m', 'pip', 'install', 'mlx-audio', 'soundfile>=0.12', 'numpy>=1.24,<3'], check=True)
    subprocess.run([str(qwen_python), '-c', 'import mlx_audio; from mlx_audio.tts.utils import load_model'], check=True)
    print('Qwen MLX dependencies verified. Model weights download on first generation.')
else:
    print('Qwen MLX is available only on Apple Silicon; other voice engines require platform-specific installation.')
print('\nInstallation complete. Run start.sh (or start.ps1 on Windows).')
