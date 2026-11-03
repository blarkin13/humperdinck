#!/usr/bin/env python3
import subprocess,sys,time,webbrowser
from pathlib import Path
root=Path(__file__).resolve().parent.parent
py=root/'.venv'/('Scripts/python.exe' if sys.platform=='win32' else 'bin/python')
if not py.exists():sys.exit('Run scripts/install.py first')
processes=[]
try:
    processes.append(subprocess.Popen([str(py),'-m','uvicorn','backend.app:app','--host','127.0.0.1','--port','8000'],cwd=root))
    processes.append(subprocess.Popen(['npm.cmd' if sys.platform=='win32' else 'npm','run','dev'],cwd=root/'frontend'))
    time.sleep(2)
    webbrowser.open('http://127.0.0.1:5173')
    print('Voice Studio running at http://127.0.0.1:5173 — Ctrl+C to stop')
    while all(p.poll() is None for p in processes):time.sleep(1)
finally:
    for p in processes:p.terminate()
