#!/usr/bin/env python3
"""Install optional Chatterbox dependencies in the existing virtual environment."""
from pathlib import Path
import subprocess, sys
root=Path(__file__).resolve().parent.parent
python=root/'.venv'/('Scripts/python.exe' if sys.platform=='win32' else 'bin/python')
if not python.exists():
    sys.exit('Run install.ps1 or install.sh first.')
print('Installing Chatterbox and ML dependencies. This may take several minutes.')
subprocess.run([str(python),'-m','pip','install','-r',str(root/'backend/requirements-voice.txt')],check=True)
print('Voice engine installed. First generation will download model weights.')
