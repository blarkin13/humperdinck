#!/usr/bin/env python3
"""Install the Chatterbox narration engine into its own environment (.venv-chatterbox)."""
from pathlib import Path
import subprocess, sys
root=Path(__file__).resolve().parent.parent
python=root/'.venv'/('Scripts/python.exe' if sys.platform=='win32' else 'bin/python')
if not python.exists():
    sys.exit('Run install.ps1 or install.sh first.')
subprocess.run([str(python),str(root/'scripts/install_engine.py'),'chatterbox'],check=True)
print('Voice engine installed. First generation will download model weights.')
