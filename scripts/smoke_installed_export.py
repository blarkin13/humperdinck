#!/usr/bin/env python3
"""Export real narration audio from an *installed* Humperdinck package.

Run after installing the built Windows EXE or Linux DEB. Starts the installed
localhost server with a fresh data folder, downloads the Kokoro voice through
the app's own Models API, renders a two-section narration as WAV and as MP3
through the export pipeline, cancels one render and resumes it with Try
again, and checks every downloaded file is real audio.
"""
from __future__ import annotations

import argparse
from io import BytesIO
import json
from pathlib import Path
import socket
import subprocess
import sys
import tempfile
import time
from urllib.error import HTTPError
from urllib.request import Request, urlopen

import soundfile as sf

VOICE = 'af_heart'
BLOCKS = [
    {'text': 'The old lighthouse stood quietly above the waves.', 'voice_key': 'preset:kokoro:' + VOICE, 'delay_after': 0.3},
    {'text': 'Every night its beam swept slowly across the water.', 'voice_key': 'preset:kokoro:' + VOICE, 'delay_after': 0},
]


def call(base, path, body=None, method=None, timeout=30):
    data = None if body is None else json.dumps(body).encode()
    req = Request(base + path, data=data, method=method or ('POST' if data else 'GET'),
                  headers={'Content-Type': 'application/json'} if data else {})
    with urlopen(req, timeout=timeout) as response:
        raw = response.read()
    return raw if path.startswith('/api/outputs') or not raw else json.loads(raw)


def wait_job(base, job, limit, accept=('complete',)):
    deadline = time.monotonic() + limit
    while time.monotonic() < deadline:
        job = call(base, '/api/jobs/' + job['job_id'])
        if job['status'] in accept:
            return job
        if job['status'] in ('failed', 'cancelled', 'complete'):
            raise RuntimeError(f"Job ended as {job['status']}: {job.get('message')}")
        time.sleep(1)
    raise RuntimeError('Timed out waiting for job: ' + json.dumps(job))


def download(base, job):
    url = job.get('download_url') or ''
    if not url:
        raise RuntimeError('Finished narration has no download URL: ' + json.dumps(job))
    with urlopen(base + url, timeout=60) as response:
        return response.read()


def check_wav(raw, label):
    info = sf.info(BytesIO(raw))
    if info.duration < 2 or info.samplerate < 16000:
        raise RuntimeError(f'{label}: implausible WAV {info}')
    audio, _ = sf.read(BytesIO(raw))
    if float(abs(audio).max()) < 0.01:
        raise RuntimeError(f'{label}: WAV is silent')
    return info.duration


def check_mp3(raw, label):
    if len(raw) < 8000 or not (raw[:3] == b'ID3' or (raw[0] == 0xFF and raw[1] & 0xE0 == 0xE0)):
        raise RuntimeError(f'{label}: not an MP3 ({len(raw)} bytes, starts {raw[:4]!r})')
    return len(raw)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--binary', type=Path, required=True, help='Installed humperdinck-server executable')
    parser.add_argument('--require-mp3', action='store_true', help='FFmpeg is installed, so MP3 export must work')
    args = parser.parse_args()
    binary = args.binary.resolve()
    if not binary.is_file():
        parser.error(f'installed server missing: {binary}')
    with socket.socket() as sock:
        sock.bind(('127.0.0.1', 0))
        port = sock.getsockname()[1]
    base = f'http://127.0.0.1:{port}'
    with tempfile.TemporaryDirectory() as data_dir:
        log_path = Path(data_dir) / 'server.log'
        with log_path.open('wb') as log:
            process = subprocess.Popen(
                [str(binary), '--port', str(port), '--data-dir', data_dir], stdout=log, stderr=subprocess.STDOUT,
                creationflags=(subprocess.CREATE_NEW_PROCESS_GROUP if sys.platform == 'win32' else 0))
            try:
                deadline = time.monotonic() + 90
                while True:
                    if process.poll() is not None:
                        raise RuntimeError('Installed server exited during startup')
                    try:
                        if call(base, '/api/health', timeout=3)['native_package'] is True:
                            break
                    except OSError:
                        if time.monotonic() > deadline:
                            raise
                        time.sleep(1)
                print('Installed server is up: ' + str(binary))
                install = call(base, '/api/models/install', {'engine': 'kokoro', 'model': VOICE})
                if install.get('job_id'):
                    wait_job(base, install, 900)
                print('Kokoro voice installed through the Models API')

                wav = wait_job(base, call(base, '/api/narrations', {'blocks': BLOCKS, 'format': 'wav'}), 600)
                seconds = check_wav(download(base, wav), 'WAV export')
                print(f'PASS: WAV export {seconds:.1f}s')
                # MP3 needs the user's own FFmpeg (not bundled for licensing).
                # Without it the app must refuse clearly instead of failing late.
                try:
                    mp3 = wait_job(base, call(base, '/api/narrations', {'blocks': BLOCKS, 'format': 'mp3'}), 600)
                except HTTPError as error:
                    detail = error.read().decode('utf-8', 'replace')
                    if error.code != 503 or 'FFmpeg' not in detail or args.require_mp3:
                        raise RuntimeError(f'MP3 export failed: HTTP {error.code} {detail}') from error
                    print('PASS: without FFmpeg, MP3 export is refused with: ' + detail)
                else:
                    print(f"PASS: MP3 export {check_mp3(download(base, mp3), 'MP3 export')} bytes")

                # Cancel then Try again, the packaged path of the render pipeline.
                blocks = [dict(b, text=b['text'] + ' Once more, for the cancel test.') for b in BLOCKS]
                job = call(base, '/api/narrations', {'blocks': blocks, 'format': 'wav'})
                try:
                    call(base, '/api/narrations/' + job['job_id'] + '/cancel', {})
                except HTTPError as error:
                    if error.code != 409:  # 409: it already finished first
                        raise
                job = wait_job(base, job, 300, accept=('cancelled', 'complete'))
                print('Cancel ended the render as: ' + job['status'])
                retry = wait_job(base, call(base, '/api/narrations', {'blocks': blocks, 'format': 'wav'}), 600)
                print(f"PASS: Try again after cancel rendered {check_wav(download(base, retry), 'Retry export'):.1f}s")
            except Exception:
                log.flush()
                print(log_path.read_text(encoding='utf-8', errors='replace')[-8000:], file=sys.stderr)
                raise
            finally:
                if sys.platform == 'win32':
                    subprocess.run(['taskkill', '/F', '/T', '/PID', str(process.pid)], capture_output=True)
                else:
                    process.terminate()
                    try:
                        process.wait(10)
                    except subprocess.TimeoutExpired:
                        process.kill()


if __name__ == '__main__':
    main()
