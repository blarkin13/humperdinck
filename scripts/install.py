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
# Voice design engine for this platform, in its own environment (see backend/catalog.py).
engine = 'qwen-mlx' if sys.platform == 'darwin' and platform.machine() == 'arm64' else 'qwen-torch'
print(f'\nInstalling the {engine} voice design engine...')
subprocess.run([str(python), str(root/'scripts/install_engine.py'), engine], check=True)
print('Download model weights from the Models tab in the app (needs internet once).')
print('\nInstallation complete. Run start.sh (or double-click start.cmd on Windows).')
