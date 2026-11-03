"""Speech engine worker, run as a separate process inside an engine's own venv.

Reads one JSON request on stdin and writes JSON lines on stdout:
{"progress": [done, total]} while working, then {"ok": true} or {"error": "..."}.
Running each job in a fresh process keeps Qwen and Chatterbox dependencies apart
and returns all model memory to the OS when the job ends.
"""
import json
import sys
from pathlib import Path


def emit(**message):
    print(json.dumps(message), flush=True)


def main():
    request = json.loads(sys.stdin.read())
    if request.get('check'):
        # Import probe used by the backend to report which engines are installed.
        if request['engine'] == 'qwen':
            import mlx_audio  # noqa: F401
        else:
            import chatterbox.tts  # noqa: F401
        emit(ok=True)
        return
    progress = lambda done, total: emit(progress=[done, total])
    output = Path(request['output'])
    if request['engine'] == 'qwen':
        from backend.qwen_engine import QwenVoiceDesigner
        QwenVoiceDesigner().synthesize(request['text'], request['description'], output, on_progress=progress)
    else:
        from backend.engine import VoiceEngine
        VoiceEngine().synthesize(request['text'], Path(request['reference']), output, on_progress=progress)
    emit(ok=True)


if __name__ == '__main__':
    try:
        main()
    except Exception as exc:
        emit(error=f'{type(exc).__name__}: {exc}')
        sys.exit(1)
