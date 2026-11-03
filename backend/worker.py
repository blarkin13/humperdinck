"""Speech engine worker, run as a separate process inside an engine's own venv.

One-shot mode reads a single JSON request on stdin. With --serve it reads one JSON
request per line and keeps the model loaded between requests until stdin closes.
Each request produces JSON lines on stdout: {"loaded": true} once the model is ready,
{"progress": [done, total]} while working, then {"ok": true} or {"error": "..."}.
Running engines in their own processes keeps Qwen and Chatterbox dependencies apart
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


engines = {}


def engine_for(name):
    if name not in engines:
        if os.environ.get('HUMPERDINCK_FAKE_ENGINE') == '1':
            engines[name] = FakeEngine()
        elif name == 'qwen':
            from backend.qwen_engine import QwenVoiceDesigner
            engines[name] = QwenVoiceDesigner()
            engines[name].load()
        else:
            from backend.engine import VoiceEngine
            engines[name] = VoiceEngine()
            engines[name].load()
    return engines[name]


def handle(request):
    if request.get('check'):
        # Import probe used by the backend to report which engines are installed.
        if os.environ.get('HUMPERDINCK_FAKE_ENGINE') != '1':
            if request['engine'] == 'qwen':
                import mlx_audio  # noqa: F401
            else:
                import chatterbox.tts  # noqa: F401
        emit(ok=True)
        return
    engine = engine_for(request['engine'])
    emit(loaded=True)
    progress = lambda done, total: emit(progress=[done, total])
    output = Path(request['output'])
    voice = request['description'] if request['engine'] == 'qwen' else Path(request['reference'])
    engine.synthesize(request['text'], voice, output, on_progress=progress)
    emit(ok=True)


def run(request):
    try:
        handle(request)
    except Exception as exc:
        emit(error=f'{type(exc).__name__}: {exc}')
        return False
    return True


if __name__ == '__main__':
    if '--serve' in sys.argv:
        for line in sys.stdin:
            if line.strip():
                run(json.loads(line))
    elif not run(json.loads(sys.stdin.read())):
        sys.exit(1)
