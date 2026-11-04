#!/usr/bin/env python3
"""Install Qwen3-TTS voice cloning into its own environment (.venv-qwen-torch)."""
from pathlib import Path
import subprocess, sys
root=Path(__file__).resolve().parent.parent
python=root/'.venv'/('Scripts/python.exe' if sys.platform=='win32' else 'bin/python')
if not python.exists():
    sys.exit('Run install.cmd (Windows) or install.sh first.')
# Download the model now: Humperdinck runs offline, so it cannot fetch it on first use.
subprocess.run([str(python),str(root/'scripts/install_engine.py'),'qwen-torch','--model','Qwen/Qwen3-TTS-12Hz-0.6B-Base'],check=True)
print('Voice engine and model installed.')
