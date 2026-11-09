#!/usr/bin/env python3
"""Humperdinck Voice Publisher: a local helper that can ONLY create and edit
the Built-In Humperdinck Voices and the Voice Gallery.

It starts the normal Humperdinck backend on a private loopback port and puts a
small gatekeeper in front of it. The gatekeeper serves one page and forwards
only the voice-publishing requests listed in ALLOWED; everything else (narration,
video, accounts, settings, models...) is refused with 404.

Run it with ./voice-publisher.sh from the developer copy of the repository.
"""
from __future__ import annotations

import http.client
import os
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
import re
import socket
import subprocess
import sys
import time
import webbrowser

ROOT = Path(__file__).resolve().parents[1]
PAGE = Path(__file__).with_name('voice_publisher.html')
HEX = r'[0-9a-zA-Z]{1,64}'
JOB = r'[0-9a-f]{32}'

# (method, path) pairs the helper may use. Anything not listed is refused.
ALLOWED = [
    ('GET', r'/api/voices'),                                   # list source voices
    ('POST', r'/api/voices'),                                  # add a recording (consent required)
    ('GET', rf'/api/voices/{HEX}/audio'),                      # listen to a source voice
    ('PATCH', rf'/api/voices/{HEX}'),                          # rename / change category
    ('GET', r'/api/starter-voices'),                           # built-in + gallery list
    ('GET', rf'/api/starter-voices/{HEX}/sample\.wav'),
    ('POST', rf'/api/starter-voices/{HEX}/generate'),
    ('POST', rf'/api/starter-voices/{HEX}/approve'),
    ('PUT', rf'/api/starter-voices/{HEX}/channel'),            # built-in <-> gallery
    ('PATCH', rf'/api/starter-voices/{HEX}'),                  # rename in the pack
    ('DELETE', rf'/api/starter-voices/{HEX}'),                 # take out of the pack
    ('POST', r'/api/starter-voices/publish'),
    ('POST', rf'/api/starter-voices/from-design/{HEX}'),       # designed voice -> source voice
    # Voice design: written description + sliders, previews, saving.
    ('GET', r'/api/designed-voices'),
    ('POST', r'/api/designed-voices'),
    ('POST', r'/api/designed-voices/draft-preview'),
    ('GET', rf'/api/designed-voices/{HEX}'),
    ('PATCH', rf'/api/designed-voices/{HEX}'),
    ('DELETE', rf'/api/designed-voices/{HEX}'),
    ('POST', rf'/api/designed-voices/{HEX}/versions'),
    ('POST', rf'/api/designed-voices/{HEX}/versions/\d+/attach-preview'),
    ('POST', rf'/api/designed-voices/{HEX}/preview'),
    ('GET', rf'/api/designed-samples/{HEX}'),
    ('POST', r'/api/voice-refinement/suggest'),               # sliders from a description
    # Sliders on uploaded recordings.
    ('GET', rf'/api/voices/{HEX}/refinement'),
    ('PUT', rf'/api/voices/{HEX}/refinement'),
    ('POST', rf'/api/voices/{HEX}/refinement-preview'),
    ('GET', rf'/api/jobs/{JOB}'),                              # sample progress
    ('GET', rf'/api/outputs/{JOB}\.wav'),                      # listen to a new sample
]
_COMPILED = [(m, re.compile(p + r'\Z')) for m, p in ALLOWED]


def allowed(method: str, path: str) -> bool:
    path = path.split('?', 1)[0]
    if '..' in path or '%' in path:
        return False
    return any(method == m and rx.match(path) for m, rx in _COMPILED)


def free_port() -> int:
    with socket.socket() as s:
        s.bind(('127.0.0.1', 0))
        return s.getsockname()[1]


def make_handler(backend_port: int, origin: str):
    class Handler(BaseHTTPRequestHandler):
        def log_message(self, *args):
            pass

        def _send(self, code, body=b'', kind='text/plain; charset=utf-8'):
            self.send_response(code)
            self.send_header('Content-Type', kind)
            self.send_header('Content-Length', str(len(body)))
            self.send_header('Cache-Control', 'no-store')
            self.end_headers()
            self.wfile.write(body)

        def _handle(self):
            if self.command == 'GET' and self.path in ('/', '/index.html'):
                return self._send(200, PAGE.read_bytes(), 'text/html; charset=utf-8')
            if not allowed(self.command, self.path):
                return self._send(404, b'Not available in the Voice Publisher')
            # Changes may only come from this page, never from another website.
            if self.command != 'GET' and self.headers.get('Origin') not in (None, origin):
                return self._send(403, b'Cross-site request refused')
            length = int(self.headers.get('Content-Length') or 0)
            body = self.rfile.read(length) if length else None
            headers = {k: v for k, v in self.headers.items()
                       if k.lower() in ('content-type', 'content-length', 'range', 'accept')}
            connection = http.client.HTTPConnection('127.0.0.1', backend_port, timeout=600)
            try:
                connection.request(self.command, self.path, body=body, headers=headers)
                reply = connection.getresponse()
                data = reply.read()
            except OSError:
                return self._send(502, b'The Humperdinck engine is not running')
            finally:
                connection.close()
            self._send(reply.status, data, reply.getheader('Content-Type') or 'application/octet-stream')

        do_GET = do_POST = do_PUT = do_PATCH = do_DELETE = _handle

    return Handler


def main() -> int:
    python = sys.executable  # voice-publisher.sh starts this with the project's .venv
    backend_port, port = free_port(), int(os.environ.get('VOICE_PUBLISHER_PORT') or 8765)
    # The publisher is the owner's own tool: every voice feature is unlocked here.
    env = dict(os.environ, HUMPERDINCK_SKIP_PRESET_BOOTSTRAP='1',
               HUMPERDINCK_ENABLE_DEV_ENTITLEMENTS='1', HUMPERDINCK_DEV_PRO='1')
    env.pop('HUMPERDINCK_NATIVE_PACKAGE', None)  # publishing is developer-copy only
    backend = subprocess.Popen([str(python), '-m', 'uvicorn', 'backend.app:app', '--host', '127.0.0.1',
                                '--port', str(backend_port), '--log-level', 'warning'], cwd=ROOT, env=env)
    try:
        for _ in range(120):
            try:
                socket.create_connection(('127.0.0.1', backend_port), timeout=1).close()
                break
            except OSError:
                if backend.poll() is not None:
                    print('The Humperdinck backend did not start. Run bash install.sh first.', file=sys.stderr)
                    return 1
                time.sleep(0.5)
        origin = f'http://127.0.0.1:{port}'
        server = ThreadingHTTPServer(('127.0.0.1', port), make_handler(backend_port, origin))
        print(f'Humperdinck Voice Publisher: {origin}  (Ctrl+C to quit)')
        webbrowser.open(origin)
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        backend.terminate()
    return 0


if __name__ == '__main__':
    sys.exit(main())
