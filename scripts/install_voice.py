#!/usr/bin/env python3
"""Install the Chatterbox narration engine into its own environment (.venv-chatterbox)."""
from pathlib import Path
import subprocess, sys
root=Path(__file__).resolve().parent.parent
python=root/'.venv'/('Scripts/python.exe' if sys.platform=='win32' else 'bin/python')
if not python.exists():
    sys.exit('Run install.cmd (Windows) or install.sh first.')
# Download the model now: Humperdinck runs offline, so it cannot fetch it on first use.
subprocess.run([str(python),str(root/'scripts/install_engine.py'),'chatterbox','--model','ResembleAI/chatterbox'],check=True)
print('Voice engine and model installed.')
