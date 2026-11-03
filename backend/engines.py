"""Run speech engines in isolated worker processes.

Each engine may have its own virtual environment (.venv-qwen, .venv-chatterbox),
so their ML dependencies never conflict. Older installs that put everything in
.venv keep working because the main environment is used as a fallback.
"""
import json
import os
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
ENGINES = ('qwen', 'chatterbox')


def _venv_python(venv: Path):
    return venv / ('Scripts/python.exe' if sys.platform == 'win32' else 'bin/python')


def candidates(engine):
    override = os.environ.get(f'VOICE_STUDIO_{engine.upper()}_PYTHON')
    if override:
        return [Path(override)]
    return [p for p in (_venv_python(ROOT / f'.venv-{engine}'), _venv_python(ROOT / '.venv'), Path(sys.executable)) if p.exists()]


_resolved = {}


def _call(python, request, on_progress=None, timeout=None):
    # stderr goes to a file: ML libraries log heavily and a full pipe would block the worker.
    with tempfile.TemporaryFile('w+') as errors:
        process = subprocess.Popen([str(python), '-m', 'backend.worker'], cwd=ROOT,
                                   stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=errors, text=True)
        process.stdin.write(json.dumps(request))
        process.stdin.close()
        result = None
        for line in process.stdout:
            try:
                message = json.loads(line)
            except json.JSONDecodeError:
                continue  # libraries sometimes print to stdout
            if not isinstance(message, dict):
                continue
            if 'progress' in message and on_progress:
                on_progress(*message['progress'])
            elif 'ok' in message or 'error' in message:
                result = message
        process.wait(timeout=timeout)
        errors.seek(0)
        stderr = errors.read()
    if result and result.get('ok') and process.returncode == 0:
        return
    if result and result.get('error'):
        raise RuntimeError(result['error'])
    tail = stderr.strip().splitlines()[-1:] or ['no output']
    raise RuntimeError(f'{request["engine"]} worker exited with code {process.returncode}: {tail[0]}')


def python_for(engine):
    """Return the first interpreter that can import the engine, or None."""
    # Only successes are cached, so an engine installed later is found without a restart.
    if engine not in _resolved:
        for python in candidates(engine):
            try:
                _call(python, {'engine': engine, 'check': True}, timeout=120)
            except Exception:
                continue
            _resolved[engine] = python
            break
    return _resolved.get(engine)


def available(engine):
    return python_for(engine) is not None


def synthesize(engine, output, text, *, description='', reference=None, on_progress=None):
    python = python_for(engine)
    if python is None:
        raise RuntimeError(f'{engine} engine is not installed')
    _call(python, {'engine': engine, 'text': text, 'description': description,
                   'reference': str(reference) if reference else None, 'output': str(output)}, on_progress)
