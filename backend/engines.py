"""Run speech engines in isolated worker processes.

Each engine may have its own virtual environment (.venv-qwen, .venv-qwen-torch),
so their ML dependencies never conflict. Older installs that put everything in
.venv keep working because the main environment is used as a fallback.

A worker stays running between jobs so the model is loaded once. At most one large
model is resident (small engines like Kokoro may stay beside it), and an idle worker exits after HUMPERDINCK_IDLE_TIMEOUT_S
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
        return ('The voice model is not fully downloaded yet. Open Models and click Setup guide, then Set up everything '
                f'(needs internet once). Details: {error[-300:]}')
    return error


def python_for(engine):
    """Return the first interpreter that can import the engine, or None."""
    if os.environ.get('HUMPERDINCK_NATIVE_PACKAGE') == '1':
        if engine == 'kokoro':
            return Path(sys.executable) if installed(engine) else None
        from backend import native_runtime
        return native_runtime.runtime_python(engine) if native_runtime.supported(engine) and installed(engine) else None
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
        if engine == 'kokoro':
            import importlib.util
            return importlib.util.find_spec('kokoro_onnx') is not None
        from backend import native_runtime
        if not native_runtime.supported(engine):
            return False
        python = native_runtime.runtime_python(engine)
        if not python.is_file():
            return False
        modules = [m.split('.')[0] for m in catalog.ENGINES[engine]['imports']]
        try:
            return subprocess.run([str(python), '-c', _FIND, *modules],
                                  capture_output=True, timeout=12,
                                  env=native_runtime.environment()).returncode == 0
        except (OSError, subprocess.TimeoutExpired, RuntimeError):
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
        native = os.environ.get('HUMPERDINCK_NATIVE_PACKAGE') == '1'
        # The packaged app runs Kokoro inside its own executable. Production mode
        # from source (scripts/start_production_mode.py) has no such executable.
        bundled_worker = native and engine == 'kokoro' and getattr(sys, 'frozen', False)
        command = ([str(python), '--native-engine-worker', '--serve'] if bundled_worker
                   else [str(python), '-m', 'backend.worker', '--serve'])
        env = worker_env()
        if native and not bundled_worker:
            from backend import native_runtime
            env.update(native_runtime.environment())
        self.process = subprocess.Popen(command, cwd=ROOT, env=env,
                                        stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=self.errors,
                                        text=True, bufsize=1)
        self.messages = queue.Queue()
        self.loaded = False
        self.device = None
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
                if message.get('device'):
                    self.device = message['device']
                    devices[self.engine] = message['device']
            elif 'progress' in message:
                if on_progress:
                    on_progress(*message['progress'])
            elif message.get('ok'):
                self.last_used = time.monotonic()
                return
            elif 'error' in message:
                self.last_used = time.monotonic()
                raise RuntimeError(explain(message['error']))


# The device each engine last loaded on, kept after its worker exits (shown in Models).
devices = {}


# Small CPU engines that may stay warm beside one large model (a few hundred MB each).
LIGHT = {'kokoro', 'openvoice'}


def model_key(engine, model):
    """The model a worker must have loaded. Kokoro loads one model for all voices."""
    return None if engine == 'kokoro' else model


class Pool:
    """Keeps warm workers: at most one large model plus the small engines in LIGHT.

    Character lines alternate Kokoro and OpenVoice, and narration alternates
    Kokoro voices; neither should reload a model per line. Callers serialize
    generation (app.engine_lock), so only one worker runs at a time.
    """

    def __init__(self):
        self.lock = Lock()
        self.workers = {}  # engine -> Worker
        self.active = None  # the worker currently generating
        self.recent = None  # the worker used most recently (for status)
        Thread(target=self._reap, daemon=True).start()

    @property
    def busy(self):
        return self.active is not None

    @property
    def worker(self):
        """The most recently used live worker (kept for callers and tests)."""
        return self.recent if self.recent and self.recent.alive() else None

    def _reap(self):
        while True:
            time.sleep(min(5, max(0.05, setting('IDLE_TIMEOUT_S', 300) / 4)))
            with self.lock:
                for engine, worker in list(self.workers.items()):
                    if worker is not self.active and time.monotonic() - worker.last_used > setting('IDLE_TIMEOUT_S', 300):
                        self._drop(engine)

    def _drop(self, engine):
        worker = self.workers.pop(engine, None)
        if worker:
            if self.recent is worker:
                self.recent = None
            worker.stop()

    def _acquire(self, engine, model):
        key = model_key(engine, model)
        with self.lock:
            worker = self.workers.get(engine)
            if worker and (worker.model != key or not worker.alive()):
                self._drop(engine)
            if engine not in LIGHT:
                # Only one large model in memory at a time: stop the other one first.
                for other in [e for e in self.workers if e != engine and e not in LIGHT]:
                    self._drop(other)
            if engine not in self.workers:
                python = python_for(engine)
                if python is None:
                    raise RuntimeError(f'{engine} engine is not installed')
                self.workers[engine] = Worker(engine, key, python)
            worker = self.workers[engine]
            self.active = self.recent = worker
            return worker

    def synthesize(self, engine, request, on_progress=None):
        worker = self._acquire(engine, request.get('model'))
        try:
            worker.run(request, on_progress)
        finally:
            with self.lock:
                self.active = None
                if self.workers.get(engine) is worker and not worker.alive():
                    self.workers.pop(engine, None)
                    if self.recent is worker:
                        self.recent = None

    def status(self):
        with self.lock:
            worker = self.worker
            if not worker:
                return None
            busy = worker is self.active
            return {'engine': worker.engine, 'model': worker.model, 'loaded': worker.loaded, 'busy': busy,
                    'device': worker.device,
                    'idle_seconds': 0 if busy else round(time.monotonic() - worker.last_used),
                    'resident': sorted(e for e, w in self.workers.items() if w.alive())}

    def shutdown(self):
        with self.lock:
            for engine in list(self.workers):
                self._drop(engine)


pool = Pool()


def synthesize(engine, output, text, *, model, mode, description='', reference=None, ref_text=None, on_progress=None, speed=1.0, blend=None):
    pool.synthesize(engine, {'engine': engine, 'model': model, 'mode': mode, 'text': text, 'description': description,
                             'reference': str(reference) if reference else None, 'ref_text': ref_text,
                             'preset_voice': model if mode == 'preset' else None, 'speed': float(speed),
                             'blend': blend,
                             'output': str(output)}, on_progress)


def design(choice, output, text, description, on_progress=None):
    """Generate a preview from a voice description with the chosen design model."""
    synthesize(choice['engine'], output, text, model=choice['model'], mode='design', description=description, on_progress=on_progress)


def clone(choice, output, text, reference, ref_text=None, on_progress=None, blend=None):
    """Speak text in the voice of a reference clip with the chosen cloning model.

    ``blend`` ({'reference', 'weight'}) makes an impression: the clone's speaker
    embedding is moved part of the way toward the voice in another recording.
    """
    extra = {}
    if blend is not None:
        extra['blend'] = {'reference': str(blend['reference']), 'weight': float(blend['weight'])}
    synthesize(choice['engine'], output, text, model=choice['model'], mode='clone', reference=reference,
               ref_text=ref_text, on_progress=on_progress, **extra)


def preset(engine, voice, output, text, on_progress=None, speed=1.0, blend=None):
    """Speak with one named Kokoro voice, not a cloned reference recording.

    ``blend`` ({'voice', 'weight'}) makes an impression: the voice's style moved
    part of the way toward another Kokoro voice.
    """
    if engine != 'kokoro' or voice not in catalog.PRESET_VOICES[engine]:
        raise ValueError('Unknown preset voice')
    if blend is not None and (blend.get('voice') not in catalog.PRESET_VOICES[engine]
                              or not 0 < float(blend.get('weight', 0)) <= 0.6):
        raise ValueError('Invalid impression blend')
    extra = {'speed': speed} if speed != 1 else {}
    if blend is not None:
        extra['blend'] = {'voice': blend['voice'], 'weight': float(blend['weight'])}
    synthesize(engine, output, text, model=voice, mode='preset', on_progress=on_progress, **extra)


def convert(source, targets, output, on_progress=None):
    """Re-voice the source recording into the voice heard in the target clips (OpenVoice)."""
    model = next(iter(catalog.ENGINES['openvoice']['models']))
    pool.synthesize('openvoice', {'engine': 'openvoice', 'model': model, 'mode': 'convert', 'text': '',
                                  'reference': str(source), 'targets': [str(t) for t in targets],
                                  'output': str(output)}, on_progress)
