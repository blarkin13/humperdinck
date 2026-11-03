#!/usr/bin/env python3
"""Install Chatterbox into its own environment (.venv-chatterbox)."""
from pathlib import Path
import subprocess, sys
root=Path(__file__).resolve().parent.parent
python=root/'.venv'/('Scripts/python.exe' if sys.platform=='win32' else 'bin/python')
if not python.exists():
    sys.exit('Run install.ps1 or install.sh first.')
engine_dir=root/'.venv-chatterbox'
engine_python=engine_dir/('Scripts/python.exe' if sys.platform=='win32' else 'bin/python')
# A separate environment keeps PyTorch/Chatterbox pins from breaking the Qwen engine or the API.
if not engine_python.exists():
    subprocess.run([str(python),'-m','venv',str(engine_dir)],check=True)
print('Installing Chatterbox and ML dependencies into .venv-chatterbox. This may take several minutes.')
subprocess.run([str(engine_python),'-m','pip','install','--upgrade','pip'],check=True)
subprocess.run([str(engine_python),'-m','pip','install','-r',str(root/'backend/requirements-voice.txt')],check=True)
subprocess.run([str(engine_python),'-c','import chatterbox.tts'],check=True)
print('Voice engine installed. First generation will download model weights.')
