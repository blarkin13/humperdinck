"""Opt-in network server so phones, tablets and other computers can use this studio.

The desktop UI keeps its private loopback server. When the owner turns network
sharing on, a second listener serves the same app on all interfaces, but every
request must carry the access code (set once as a cookie by the pairing link).
Server and account settings stay loopback-only, so a paired device can never
read the code, change sharing or sign the owner out.

Remote access is meant to go through a private network such as Tailscale; the
listener speaks plain HTTP and must not be exposed to the internet directly.
"""
from __future__ import annotations

import hmac
import html
import ipaddress
import os
import re
import json
import secrets
import socket
import subprocess
import threading
from http.cookies import SimpleCookie
from pathlib import Path
from urllib.parse import parse_qs, urlencode

COOKIE = 'humperdinck_access'
DEFAULT_PORT = 8765
# Paths a paired device must never reach: they manage this server or the owner's account.
LOOPBACK_ONLY = ('/api/server', '/api/account', '/api/license/export', '/api/license/import',
                 '/api/license/activate', '/api/updates/install')


def load(path: Path) -> dict:
    try:
        data = json.loads(path.read_text()) if path.is_file() else {}
    except (OSError, ValueError):
        data = {}
    return data if isinstance(data, dict) else {}


def save(path: Path, data: dict) -> None:
    temporary = path.with_suffix('.tmp')
    temporary.write_text(json.dumps(data))
    try:
        temporary.chmod(0o600)
    except OSError:
        pass
    temporary.replace(path)


def network_config(path: Path) -> dict:
    """Return the stored network settings, creating an access code on first use."""
    data = load(path)
    changed = False
    port = data.get('network_port')
    if not isinstance(port, int) or not 1024 <= port <= 65535:
        data['network_port'] = DEFAULT_PORT
        changed = True
    if not isinstance(data.get('network_token'), str) or len(data['network_token']) < 16:
        data['network_token'] = new_token()
        changed = True
    data['network_enabled'] = data.get('network_enabled') is True
    if changed:
        save(path, data)
    return data


def new_token() -> str:
    # Short enough to type on a phone, long enough that guessing is impractical.
    alphabet = 'abcdefghjkmnpqrstuvwxyz23456789'
    return '-'.join(''.join(secrets.choice(alphabet) for _ in range(5)) for _ in range(4))


def _interface_addresses() -> set[str]:
    """IPv4 addresses actually assigned to this computer's network interfaces."""
    found: set[str] = set()
    commands = [['ipconfig'] if os.name == 'nt' else ['ifconfig'], ['ip', '-4', 'addr']]
    for command in commands:
        try:
            output = subprocess.run(command, capture_output=True, text=True, timeout=3).stdout
        except (OSError, subprocess.SubprocessError):
            continue
        found.update(re.findall(r'(?:inet |IPv4 Address[ .]*: )(?:addr:)?(\d+\.\d+\.\d+\.\d+)', output))
        if found:
            break
    return found


def _addresses() -> list[str]:
    # Hostname lookups can return stale DHCP leases, so trust interfaces first.
    found = _interface_addresses()
    try:  # The interface used for the default route; no packet is sent.
        with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as probe:
            probe.connect(('192.0.2.1', 9))
            found.add(probe.getsockname()[0])
    except OSError:
        pass
    try:
        output = subprocess.run(['tailscale', 'ip', '-4'], capture_output=True, text=True, timeout=2).stdout
        found.update(line.strip() for line in output.splitlines() if line.strip())
    except (OSError, subprocess.SubprocessError):
        pass
    usable = []
    for value in found:
        try:
            address = ipaddress.ip_address(value)
        except ValueError:
            continue
        if not address.is_loopback and not address.is_link_local:
            usable.append(value)
    return sorted(usable)


TAILSCALE = ipaddress.ip_network('100.64.0.0/10')


def addresses(port: int) -> list[dict]:
    result = []
    for value in _addresses():
        remote = ipaddress.ip_address(value) in TAILSCALE
        result.append({'address': value, 'url': f'http://{value}:{port}/',
                       'kind': 'remote' if remote else 'local',
                       'label': 'Tailscale (remote)' if remote else 'This network (Wi-Fi / Ethernet)'})
    result.sort(key=lambda item: item['kind'] != 'local')
    return result


LOGIN_PAGE = """<!doctype html><html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1"><title>Humperdinck</title>
<style>body{{font-family:system-ui,sans-serif;background:#1b1714;color:#f3e9da;display:grid;place-items:center;min-height:100vh;margin:0}}
form{{background:#2a231e;padding:28px;border-radius:12px;max-width:340px;width:calc(100% - 32px)}}
input,button{{font:inherit;width:100%;box-sizing:border-box;padding:10px;margin-top:10px;border-radius:8px;border:1px solid #5a4a3c}}
button{{background:#c8873e;color:#1b1714;border:0;font-weight:600}}p{{color:#cdbca8}}.e{{color:#f08a7a}}</style></head>
<body><form method="get" action="/"><h1>Humperdinck</h1>
<p>Enter the access code shown in Server settings on the computer running Humperdinck.</p>{error}
<input name="access" autocomplete="off" autocapitalize="off" placeholder="xxxxx-xxxxx-xxxxx-xxxxx" aria-label="Access code" autofocus>
<button type="submit">Connect</button></form></body></html>"""


class AccessGate:
    """ASGI wrapper that requires the access code before passing requests to the app."""

    def __init__(self, app, token_source):
        self.app = app
        self.token_source = token_source

    def _token(self) -> str:
        return self.token_source() or ''

    async def __call__(self, scope, receive, send):
        if scope['type'] == 'lifespan':
            return await self.app(scope, receive, send)
        if scope['type'] not in ('http', 'websocket'):
            return
        path = scope.get('path', '/')
        token = self._token()
        headers = {k.decode('latin-1').lower(): v.decode('latin-1') for k, v in scope.get('headers', [])}
        cookie = SimpleCookie()
        try:
            cookie.load(headers.get('cookie', ''))
        except Exception:
            pass
        presented = cookie[COOKIE].value if COOKIE in cookie else ''
        if not presented and headers.get('authorization', '').startswith('Bearer '):
            presented = headers['authorization'][7:].strip()
        query = parse_qs(scope.get('query_string', b'').decode('latin-1'))
        offered = (query.get('access') or [''])[0].strip().lower()

        if scope['type'] == 'http' and offered:
            if token and hmac.compare_digest(offered, token):
                rest = {k: v for k, v in query.items() if k != 'access'}
                location = path + ('?' + urlencode(rest, doseq=True) if rest else '')
                return await self._respond(send, 303, b'', [
                    (b'location', location.encode('latin-1')),
                    (b'set-cookie', f'{COOKIE}={token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=31536000'.encode()),
                ])
            return await self._login(send, 'That access code did not match.')

        if not (token and presented and hmac.compare_digest(presented, token)):
            if scope['type'] == 'websocket':
                return await send({'type': 'websocket.close', 'code': 4401})
            if path.startswith('/api/'):
                return await self._respond(send, 401, b'{"detail":"Access code required"}',
                                           [(b'content-type', b'application/json')])
            return await self._login(send, '')

        if any(path == p or path.startswith(p + '/') for p in LOOPBACK_ONLY):
            if scope['type'] == 'websocket':
                return await send({'type': 'websocket.close', 'code': 4403})
            return await self._respond(send, 403, b'{"detail":"Only available on the computer running Humperdinck"}',
                                       [(b'content-type', b'application/json')])
        return await self.app(scope, receive, send)

    async def _login(self, send, error: str):
        body = LOGIN_PAGE.format(error=f'<p class="e">{html.escape(error)}</p>' if error else '').encode()
        await self._respond(send, 401 if error else 200, body, [(b'content-type', b'text/html; charset=utf-8')])

    @staticmethod
    async def _respond(send, status, body, headers):
        await send({'type': 'http.response.start', 'status': status,
                    'headers': headers + [(b'content-length', str(len(body)).encode()),
                                          (b'cache-control', b'no-store')]})
        await send({'type': 'http.response.body', 'body': body})


class NetworkServer:
    def __init__(self):
        self._lock = threading.Lock()
        self._server = None
        self._thread = None
        self.port = None
        self.error = ''

    @property
    def running(self) -> bool:
        return bool(self._server and self._thread and self._thread.is_alive() and self._server.started)

    def start(self, app, port: int, token_source) -> None:
        import time
        import uvicorn

        class _Server(uvicorn.Server):
            def install_signal_handlers(self):  # Only the main server owns signals.
                pass

        with self._lock:
            if self.running and self.port == port:
                return
            self._stop_locked()
            probe = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
            try:
                probe.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
                probe.bind(('0.0.0.0', port))
            except OSError:
                self.error = f'Port {port} is already in use. Choose another network port.'
                raise RuntimeError(self.error)
            finally:
                probe.close()
            config = uvicorn.Config(AccessGate(app, token_source), host='0.0.0.0', port=port,
                                    log_level='warning', access_log=False, lifespan='off')
            server = _Server(config)
            thread = threading.Thread(target=server.run, daemon=True, name='network-server')
            thread.start()
            deadline = time.monotonic() + 5
            while not server.started and thread.is_alive() and time.monotonic() < deadline:
                time.sleep(0.05)
            if not server.started:
                server.should_exit = True
                self.error = f'Could not start the network server on port {port}.'
                raise RuntimeError(self.error)
            self._server, self._thread, self.port, self.error = server, thread, port, ''

    def stop(self) -> None:
        with self._lock:
            self._stop_locked()

    def _stop_locked(self) -> None:
        if self._server:
            self._server.should_exit = True
        if self._thread:
            self._thread.join(timeout=5)
        self._server = self._thread = None
        self.port = None


server = NetworkServer()
