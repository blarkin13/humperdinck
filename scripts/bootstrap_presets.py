"""One-time setup for bundled Kokoro/Piper voices on fresh or updated installs.

A persistent completion marker prevents re-downloading user-deleted models on
later starts. Partial setups retry missing assets on the next launch.
"""
import os
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from backend import catalog  # noqa: E402


def bootstrap():
    if os.environ.get('HUMPERDINCK_SKIP_PRESET_BOOTSTRAP') == '1':
        return
    data = Path(os.environ.get('HUMPERDINCK_DATA') or ROOT / 'data')
    data.mkdir(parents=True, exist_ok=True)
    marker = data / '.preset-voices-installed-v1'
    if marker.is_file():
        return
    print('[Humperdinck] Installing built-in Kokoro and Piper voices (first setup only)...', flush=True)
    # Use the main environment to create each engine's dedicated virtualenv.
    python = ROOT / '.venv' / ('Scripts/python.exe' if sys.platform == 'win32' else 'bin/python')
    if not python.exists():
        raise RuntimeError('Core Python environment is missing')
    for engine in ('kokoro', 'piper'):
        if not catalog.supported(engine):
            continue
        voices = list(catalog.PRESET_VOICES[engine])
        # Installing the engine with the first voice also downloads its model.
        # Further Kokoro voices share that same bundle.
        for voice in voices[:1] if engine == 'kokoro' else voices:
            if catalog.downloaded(voice):
                # Still install missing engine dependencies even when the
                # model files were copied from another computer.
                pass
            subprocess.run([str(python), str(ROOT / 'scripts' / 'install_engine.py'),
                            engine, '--model', voice], check=True)
    marker.write_text('Kokoro and Piper defaults installed\n', encoding='utf-8')
    print('[Humperdinck] Built-in voices are ready in Voice Library.', flush=True)


if __name__ == '__main__':
    bootstrap()
