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
    marker = data / '.preset-voices-installed-v2'
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
        # Install the engine once. Kokoro presets share one voicepack; each
        # Piper voice has its own ONNX/config files.
        first = voices[0]
        subprocess.run([str(python), str(ROOT / 'scripts' / 'install_engine.py'),
                        engine, '--model', first], check=True)
        if engine == 'piper':
            voice_python = ROOT / '.venv-piper' / ('Scripts/python.exe' if sys.platform == 'win32' else 'bin/python')
            folder = catalog.preset_path('piper', '')
            for voice in voices[1:]:
                if not catalog.downloaded(voice):
                    print(f'[Humperdinck] Downloading built-in voice {voice}...', flush=True)
                    subprocess.run([str(voice_python), '-m', 'piper.download_voices', voice,
                                    '--download-dir', str(folder)], check=True)
        if not all(catalog.downloaded(voice) for voice in voices):
            raise RuntimeError(f'{engine} voice files are incomplete')
    marker.write_text('Kokoro and Piper defaults installed\n', encoding='utf-8')
    print('[Humperdinck] Built-in voices are ready in Voice Library.', flush=True)


if __name__ == '__main__':
    bootstrap()
