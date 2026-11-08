"""Speech engine worker, run as a separate process inside an engine's own venv.

One-shot mode reads a single JSON request on stdin. With --serve it reads one JSON
request per line and keeps the model loaded between requests until stdin closes.
Each request produces JSON lines on stdout: {"loaded": true} once the model is ready,
{"progress": [done, total]} while working, then {"ok": true} or {"error": "..."}.
Running engines in their own processes keeps TTS dependencies apart
and returns all model memory to the OS when the worker exits.
"""
import json
import os
import sys
import time
from pathlib import Path


def emit(**message):
    print(json.dumps(message), flush=True)


class FakeEngine:
    """Test stand-in, enabled with HUMPERDINCK_FAKE_ENGINE=1; text 'sleep:N' stalls N seconds."""

    def synthesize(self, text, voice, output, on_progress=None):
        import numpy as np
        import soundfile as sf
        if text.startswith('sleep:'):
            time.sleep(float(text[6:]))
        if text == 'crash':
            os._exit(3)
        sf.write(str(output), np.zeros(2400, dtype='float32'), 24000)
        if on_progress:
            on_progress(1, 1)


current = {}  # the one loaded engine: {'key': (engine, model), 'engine': adapter}


def engine_for(name, model):
    if current.get('key') != (name, model):
        current.clear()  # keep a single model in memory
        if os.environ.get('HUMPERDINCK_FAKE_ENGINE') == '1':
            adapter = FakeEngine()
        elif name == 'qwen-mlx':
            from backend.qwen_engine import QwenVoiceDesigner, QwenBaseCloner
            adapter = QwenBaseCloner(model) if '-Base-' in model else QwenVoiceDesigner(model)
        elif name == 'qwen-torch':
            from backend.qwen_torch_engine import QwenTorchEngine
            adapter = QwenTorchEngine(model)
        elif name == 'openvoice':
            from backend.voice_converter import VoiceConverter
            adapter = VoiceConverter(model)
        elif name == 'kokoro':
            from backend.kokoro_engine import KokoroEngine
            adapter = KokoroEngine(model)
        else:
            raise ValueError(f'Unknown engine {name}')
        if hasattr(adapter, 'load'):
            adapter.load()
        current.update(key=(name, model), engine=adapter)
    return current['engine']


def device_of(name, adapter):
    """Where the model runs: {'kind': 'gpu'|'cpu', 'name': ..., 'reason': why not GPU}."""
    if getattr(adapter, 'device', None):
        return adapter.device
    if name == 'qwen-mlx':
        return {'kind': 'gpu', 'name': 'Apple GPU (MLX)'}
    return {'kind': 'cpu', 'name': 'CPU'}


def handle(request):
    if request.get('check'):
        # Import probe used by the backend to report which engines are installed.
        if os.environ.get('HUMPERDINCK_FAKE_ENGINE') != '1':
            import importlib
            from backend.catalog import ENGINES
            for module in ENGINES[request['engine']]['imports']:
                importlib.import_module(module)
        emit(ok=True)
        return
    engine = engine_for(request['engine'], request.get('model'))
    emit(loaded=True, device=device_of(request['engine'], engine))
    progress = lambda done, total: emit(progress=[done, total])
    output = Path(request['output'])
    if request['mode'] == 'convert':
        engine.convert(Path(request['reference']), [Path(t) for t in request['targets']], output, on_progress=progress)
    elif request['mode'] == 'preset':
        if request['engine'] != 'kokoro':
            raise ValueError('Preset voices require Kokoro')
        engine.synthesize(request['text'], request['preset_voice'], output, on_progress=progress)
    elif request['engine'] == 'qwen-mlx' and request['mode'] == 'clone':
        engine.synthesize(request['text'], Path(request['reference']), output,
                          ref_text=request.get('ref_text'), on_progress=progress)
    elif request['engine'] == 'qwen-torch':
        if request['mode'] == 'design':
            engine.design(request['text'], request['description'], output, on_progress=progress)
        else:
            engine.clone(request['text'], Path(request['reference']), output, request.get('ref_text'), on_progress=progress)
    else:
        voice = request['description'] if request['mode'] == 'design' else Path(request['reference'])
        engine.synthesize(request['text'], voice, output, on_progress=progress)
    emit(ok=True)


def run(request):
    try:
        handle(request)
    except Exception as exc:
        emit(error=f'{type(exc).__name__}: {exc}')
        return False
    return True


def stop_when_parent_exits():
    """A native model worker must not survive its bundled local API process.

    PyInstaller/Tauri may terminate the API without running Python cleanup.
    An orphaned worker can otherwise keep several GB of model RAM allocated.
    """
    from threading import Thread
    parent = os.getppid()
    def monitor():
        while True:
            time.sleep(1.0)
            if os.getppid() != parent:
                os._exit(0)
    Thread(target=monitor, daemon=True, name="native-parent-watchdog").start()


if __name__ == '__main__':
    if os.environ.get('HUMPERDINCK_NATIVE_PACKAGE') == '1':
        stop_when_parent_exits()
    if '--serve' in sys.argv:
        for line in sys.stdin:
            if line.strip():
                run(json.loads(line))
    elif not run(json.loads(sys.stdin.read())):
        sys.exit(1)
