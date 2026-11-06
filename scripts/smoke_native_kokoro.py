#!/usr/bin/env python3
"""Real packaged Kokoro inference catches missing eSpeak, ONNX or voice data."""
from __future__ import annotations
import argparse
import json
from pathlib import Path
import subprocess
import tempfile
import soundfile as sf

ROOT = Path(__file__).resolve().parents[1]


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--target', required=True)
    args = parser.parse_args()
    binary = ROOT / 'desktop' / 'src-tauri' / 'binaries' / ('humperdinck-server-' + args.target)
    if not binary.is_file():
        parser.error('Missing native sidecar: ' + str(binary))
    with tempfile.TemporaryDirectory() as folder:
        output = Path(folder) / 'test-kokoro.wav'
        req = {'engine': 'kokoro', 'model': 'af_heart', 'mode': 'preset',
               'text': 'Hello. Welcome to Humperdinck.', 'preset_voice': 'af_heart',
               'output': str(output)}
        result = subprocess.run([str(binary), '--native-engine-worker', '--serve'],
                                input=json.dumps(req) + '\n',
                                capture_output=True, text=True, timeout=240)
        messages = []
        for line in result.stdout.splitlines():
            try:
                messages.append(json.loads(line))
            except json.JSONDecodeError:
                pass
        errors = [m['error'] for m in messages if isinstance(m, dict) and 'error' in m]
        if result.returncode or errors or not any(m.get('ok') for m in messages):
            raise RuntimeError('Frozen Kokoro worker failed: ' + str(errors) +
                               '\nSTDERR: ' + result.stderr[-5000:])
        if not output.is_file():
            raise RuntimeError('Frozen Kokoro worker reported success without WAV file')
        info = sf.info(str(output))
        if info.duration < 0.5 or info.samplerate != 24000:
            raise RuntimeError('Kokoro output has invalid audio parameters: ' + str(info))
        print('PASS: real frozen Kokoro inference, phonemizer, ONNX and WAV: ' +
              f'{info.duration:.1f}s at {info.samplerate} Hz')


if __name__ == '__main__':
    main()
