"""Run speech engines in isolated worker processes.

Each engine may have its own virtual environment (.venv-qwen, .venv-qwen-torch),
so their ML dependencies never conflict. Older installs that put everything in
.venv keep working because the main environment is used as a fallback.

A worker stays running between jobs so the model is loaded once. Only one engine is
resident at a time, and an idle worker exits after HUMPERDINCK_IDLE_TIMEOUT_S
seconds, which returns all of its memory to the OS.
"""
import json
import os
import queue
import subprocess
import sys
import tempfile
import time
from pathlib import Path
from threading import Lock, Thread

from backend import catalog

ROOT = Path(__file__).resolve().parent.parent


def setting(name, default):
    return float(os.environ.get(f'HUMPERDINCK_{name}', default))


def _venv_python(venv: Path):
    return venv / ('Scripts/python.exe' if sys.platform == 'win32' else 'bin/python')


def venv_dir(engine):
    return ROOT / f".venv-{catalog.ENGINES[engine]['venv']}"


def candidates(engine):
    override = os.environ.get(f"HUMPERDINCK_{engine.upper().replace('-', '_')}_PYTHON")
    if override:
        return [Path(override)]
    return [p for p in (_venv_python(venv_dir(engine)), _venv_python(ROOT / '.venv'), Path(sys.executable)) if p.exists()]


_resolved = {}


def worker_env():
    # Offline by default: models load from the local cache without contacting Hugging Face.
    # Set HUMPERDINCK_ONLINE=1 to allow downloading a model that is not cached yet.
    env = dict(os.environ)
    if env.get('HUMPERDINCK_ONLINE') != '1':
        env.setdefault('HF_HUB_OFFLINE', '1')
        env.setdefault('TRANSFORMERS_OFFLINE', '1')
    return env


def _call(python, request, timeout=None):
    """Run a one-shot worker, used for the import probe."""
    # stderr goes to a file: ML libraries log heavily and a full pipe would block the worker.
    with tempfile.TemporaryFile('w+') as errors:
        process = subprocess.run([str(python), '-m', 'backend.worker'], cwd=ROOT, env=worker_env(), input=json.dumps(request),
                                 stdout=subprocess.PIPE, stderr=errors, text=True, timeout=timeout)
        errors.seek(0)
        stderr = errors.read()
    for line in process.stdout.splitlines():
        try:
            message = json.loads(line)
        except json.JSONDecodeError:
            continue
        if isinstance(message, dict) and message.get('ok') and process.returncode == 0:
            return
    tail = stderr.strip().splitlines()[-1:] or ['no output']
    raise RuntimeError(explain(f'{request["engine"]} worker exited with code {process.returncode}: {tail[0]}'))


def explain(error):
    """Turn known library errors into instructions."""
    if 'OfflineModeIsEnabled' in error or 'offline mode' in error.lower() or 'LocalEntryNotFoundError' in error:
        return ('A file this model needs is not on this computer, and Humperdinck runs offline. In the Models tab, '
                f'click Download for the selected model (needs internet once). Details: {error[-300:]}')
    return error


def python_for(engine):
    """Return the first interpreter that can import the engine, or None."""
    # Unsigned native shell previews bundle only the API. They deliberately do
    # not claim that an ML worker is present or start the sidecar as Python.
    if os.environ.get('HUMPERDINCK_NATIVE_PACKAGE') == '1':
        return None
    # Only successes are cached, so an engine installed later is found without a restart.
    if engine not in _resolved and catalog.supported(engine):
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


_installed = {}  # engine -> (installed, checked at)
# Finds an engine's packages without importing them: importing torch can take many seconds.
_FIND = 'import importlib.util as u, sys; sys.exit(0 if all(u.find_spec(m) for m in sys.argv[1:]) else 1)'


def installed(engine):
    """Quick check for the Models tab and health: are the engine's packages present? Cached."""
    if os.environ.get('HUMPERDINCK_NATIVE_PACKAGE') == '1':
        return False
    if not catalog.supported(engine):
        return False
    if engine in _resolved:
        return True
    cached = _installed.get(engine)
    if cached and (cached[0] or time.monotonic() - cached[1] < 60):
        return cached[0]
    modules = [m.split('.')[0] for m in catalog.ENGINES[engine]['imports']]
    found = any(subprocess.run([str(python), '-c', _FIND, *modules], capture_output=True, timeout=30).returncode == 0
                for python in candidates(engine))
    _installed[engine] = (found, time.monotonic())
    return found


def forget(engine):
    """Drop cached checks after an engine is installed or changed."""
    _installed.pop(engine, None)
    _resolved.pop(engine, None)


class Worker:
    """A long-lived `backend.worker --serve` process for one engine."""

    def __init__(self, engine, model, python):
        self.engine = engine
        self.model = model
        self.errors = tempfile.TemporaryFile('w+')
        self.process = subprocess.Popen([str(python), '-m', 'backend.worker', '--serve'], cwd=ROOT, env=worker_env(),
                                        stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=self.errors,
                                        text=True, bufsize=1)
        self.messages = queue.Queue()
        self.loaded = False
        self.last_used = time.monotonic()
        Thread(target=self._read, daemon=True).start()

    def _read(self):
        for line in self.process.stdout:
            try:
                message = json.loads(line)
            except json.JSONDecodeError:
                continue  # libraries sometimes print to stdout
            if isinstance(message, dict):
                self.messages.put(message)
        self.messages.put(None)  # stdout closed: the process exited

    def alive(self):
        return self.process.poll() is None

    def stop(self):
        if self.alive():
            try:
                self.process.stdin.close()  # asks the worker to finish and exit
                self.process.wait(timeout=10)
            except (OSError, subprocess.TimeoutExpired):
                self.process.kill()
                self.process.wait()
        self.errors.close()

    def kill(self):
        self.process.kill()
        self.process.wait()
        self.errors.close()

    def last_error(self):
        try:
            self.errors.seek(0)
            lines = self.errors.read().strip().splitlines()
        except (OSError, ValueError):
            lines = []
        return lines[-1] if lines else 'no output'

    def run(self, request, on_progress=None):
        self.process.stdin.write(json.dumps(request) + '\n')
        self.process.stdin.flush()
        # Loading can include a first-time model download, so it gets a longer budget.
        while True:
            budget = setting('STALL_TIMEOUT_S', 600) if self.loaded else setting('LOAD_TIMEOUT_S', 1800)
            try:
                message = self.messages.get(timeout=budget)
            except queue.Empty:
                self.kill()
                stage = 'progress' if self.loaded else 'loading the model'
                raise RuntimeError(f'{self.engine} engine stopped responding ({stage} took over {int(budget)} s). '
                                   'It was restarted; please try again.')
            if message is None:
                self.process.wait()
                raise RuntimeError(f'{self.engine} engine exited unexpectedly (code {self.process.returncode}): '
                                   f'{self.last_error()}')
            if message.get('loaded'):
                self.loaded = True
            elif 'progress' in message:
                if on_progress:
                    on_progress(*message['progress'])
            elif message.get('ok'):
                self.last_used = time.monotonic()
                return
            elif 'error' in message:
                self.last_used = time.monotonic()
                raise RuntimeError(explain(message['error']))


class Pool:
    """Keeps at most one warm worker and stops it after a period of inactivity."""

    def __init__(self):
        self.lock = Lock()
        self.worker = None
        self.busy = False
        Thread(target=self._reap, daemon=True).start()

    def _reap(self):
        while True:
            time.sleep(min(5, max(0.05, setting('IDLE_TIMEOUT_S', 300) / 4)))
            with self.lock:
                worker = self.worker
                if worker and not self.busy and time.monotonic() - worker.last_used > setting('IDLE_TIMEOUT_S', 300):
                    self.worker = None
                    worker.stop()

    def _acquire(self, engine, model):
        with self.lock:
            worker = self.worker
            if worker and (worker.engine != engine or worker.model != model or not worker.alive()):
                # Only one model in memory at a time: stop the other one first.
                self.worker = None
                worker.stop()
            if self.worker is None:
                python = python_for(engine)
                if python is None:
                    raise RuntimeError(f'{engine} engine is not installed')
                self.worker = Worker(engine, model, python)
            self.busy = True
            return self.worker

    def synthesize(self, engine, request, on_progress=None):
        worker = self._acquire(engine, request.get('model'))
        try:
            worker.run(request, on_progress)
        finally:
            with self.lock:
                self.busy = False
                if self.worker is worker and not worker.alive():
                    self.worker = None

    def status(self):
        with self.lock:
            worker = self.worker
            if not worker or not worker.alive():
                return None
            return {'engine': worker.engine, 'model': worker.model, 'loaded': worker.loaded, 'busy': self.busy,
                    'idle_seconds': 0 if self.busy else round(time.monotonic() - worker.last_used)}

    def shutdown(self):
        with self.lock:
            if self.worker:
                self.worker.stop()
                self.worker = None


pool = Pool()


def synthesize(engine, output, text, *, model, mode, description='', reference=None, ref_text=None, on_progress=None):
    pool.synthesize(engine, {'engine': engine, 'model': model, 'mode': mode, 'text': text, 'description': description,
                             'reference': str(reference) if reference else None, 'ref_text': ref_text,
                             'preset_voice': model if mode == 'preset' else None,
                             'output': str(output)}, on_progress)


def design(choice, output, text, description, on_progress=None):
    """Generate a preview from a voice description with the chosen design model."""
    synthesize(choice['engine'], output, text, model=choice['model'], mode='design', description=description, on_progress=on_progress)


def clone(choice, output, text, reference, ref_text=None, on_progress=None):
    """Speak text in the voice of a reference clip with the chosen cloning model."""
    synthesize(choice['engine'], output, text, model=choice['model'], mode='clone', reference=reference,
               ref_text=ref_text, on_progress=on_progress)


def preset(engine, voice, output, text, on_progress=None):
    """Speak with one named Kokoro/Piper voice, not a cloned reference recording."""
    if engine not in ('kokoro', 'piper') or voice not in catalog.PRESET_VOICES[engine]:
        raise ValueError('Unknown preset voice')
    synthesize(engine, output, text, model=voice, mode='preset', on_progress=on_progress)
