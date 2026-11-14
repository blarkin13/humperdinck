"""Use this studio from other devices through the person's Humperdinck account.

While "Use on other devices" is on, this keeps one outbound, encrypted
WebSocket to humperdinck.studio. When the same account opens
humperdinck.studio/connect on a phone or another computer, the website sends
those browser requests over this socket and they are answered by the local
loopback server, exactly as if the browser were on this computer.

No inbound ports, router settings, access codes or extra apps. Server, account,
license and update routes are never reachable this way.
"""
from __future__ import annotations

import asyncio
import http.client
import json
import queue
import secrets
import socket
import struct
import threading
import time
from pathlib import Path

from backend import account_client

CHUNK = 256 * 1024
BLOCKED = ('/api/server', '/api/account', '/api/license/export', '/api/license/import',
           '/api/license/activate', '/api/updates/install', '/api/engine/unload')
DROP_HEADERS = {'connection', 'keep-alive', 'transfer-encoding', 'upgrade', 'host', 'content-length'}


def frame(number: int, kind: int, payload: bytes = b'') -> bytes:
    return struct.pack('>IB', number, kind) + payload


def blocked(path: str) -> bool:
    bare = path.split('?', 1)[0]
    return any(bare == p or bare.startswith(p + '/') for p in BLOCKED)


def computer_id(settings: dict) -> str:
    value = settings.get('relay_computer_id')
    if isinstance(value, str) and 16 <= len(value) <= 40 and value.isalnum() and value.islower():
        return value
    return secrets.token_hex(12)


def computer_name() -> str:
    name = socket.gethostname().split('.')[0].replace('-', ' ').strip()
    return (name or 'My computer')[:60]


def _token(data: Path) -> str | None:
    try:
        state = json.loads((Path(data) / 'account-session.json').read_text(encoding='utf-8'))
    except (OSError, ValueError):
        return None
    if not isinstance(state, dict) or state.get('expires_at', 0) <= time.time():
        return None
    token = state.get('token')
    return token if isinstance(token, str) else None


class Relay:
    def __init__(self):
        self._thread = None
        self._loop = None
        self._stop = threading.Event()
        self.state = 'off'      # off, connecting, online, signed_out, error
        self.message = ''
        self.computer = ''
        self.name = ''

    def status(self) -> dict:
        return {'state': self.state, 'message': self.message, 'computer_name': self.name}

    def start(self, data: Path, local_port: int, computer: str, name: str) -> None:
        if self._thread and self._thread.is_alive():
            return
        self._stop.clear()
        self.computer, self.name = computer, name
        self.state, self.message = 'connecting', 'Connecting…'
        self._thread = threading.Thread(target=self._run, args=(Path(data), local_port), daemon=True,
                                        name='studio-relay')
        self._thread.start()

    def stop(self) -> None:
        self._stop.set()
        loop = self._loop
        if loop:
            loop.call_soon_threadsafe(lambda: None)
        if self._thread:
            self._thread.join(timeout=5)
        self._thread = None
        self.state, self.message = 'off', ''

    def _run(self, data: Path, local_port: int) -> None:
        loop = asyncio.new_event_loop()
        self._loop = loop
        try:
            loop.run_until_complete(self._forever(data, local_port))
        finally:
            loop.close()
            self._loop = None

    async def _forever(self, data: Path, local_port: int) -> None:
        delay = 2
        while not self._stop.is_set():
            token = _token(data)
            if not token:
                self.state = 'signed_out'
                self.message = 'Sign in to your Humperdinck account on this computer first.'
                await self._sleep(5)
                continue
            try:
                await self._session(token, local_port)
                delay = 2
            except PermissionError as error:
                self.state, self.message = 'signed_out', str(error)
                await self._sleep(15)
                continue
            except Exception:
                if self._stop.is_set():
                    break
                self.state = 'connecting'
                self.message = 'Reconnecting… (check this computer’s internet connection)'
            await self._sleep(delay)
            delay = min(delay * 2, 60)

    async def _sleep(self, seconds: float) -> None:
        end = time.monotonic() + seconds
        while not self._stop.is_set() and time.monotonic() < end:
            await asyncio.sleep(0.25)

    async def _session(self, token: str, local_port: int) -> None:
        from urllib.parse import urlencode
        from websockets.asyncio.client import connect
        from websockets.exceptions import InvalidStatus

        origin = account_client._origin()
        url = origin.replace('https://', 'wss://', 1).replace('http://', 'ws://', 1)
        url += '/api/relay/host?' + urlencode({'computer': self.computer, 'name': self.name})
        ssl_context = account_client._ssl_context() if url.startswith('wss://') else None
        try:
            socket_ = await connect(url, additional_headers={'Authorization': 'Bearer ' + token,
                                                             'User-Agent': account_client.USER_AGENT},
                                    ssl=ssl_context, max_size=8 * 1024 * 1024, ping_interval=25,
                                    open_timeout=15)
        except InvalidStatus as error:
            if error.response.status_code in (401, 403):
                raise PermissionError('Your account sign-in on this computer expired. Sign in again.') from error
            raise
        async with socket_ as ws:
            self.state, self.message = 'online', ''
            requests: dict[int, dict] = {}
            send_lock = asyncio.Lock()

            async def send(message):
                async with send_lock:
                    await ws.send(message)

            stopper = asyncio.create_task(self._wait_stop())
            try:
                while True:
                    receive = asyncio.create_task(ws.recv())
                    done, _ = await asyncio.wait({receive, stopper}, return_when=asyncio.FIRST_COMPLETED)
                    if stopper in done:
                        receive.cancel()
                        return
                    message = receive.result()
                    if isinstance(message, str):
                        data = json.loads(message)
                        if data.get('type') == 'request':
                            requests[data['id']] = {'head': data, 'body': queue.Queue()}
                            asyncio.create_task(self._answer(data['id'], requests, local_port, send))
                        continue
                    if len(message) < 5:
                        continue
                    number, kind = struct.unpack('>IB', message[:5])
                    entry = requests.get(number)
                    if entry:
                        entry['body'].put(message[5:] if kind == 1 else None)
            finally:
                stopper.cancel()

    async def _wait_stop(self):
        while not self._stop.is_set():
            await asyncio.sleep(0.25)

    async def _answer(self, number: int, requests: dict, local_port: int, send) -> None:
        entry = requests[number]
        head = entry['head']
        loop = asyncio.get_running_loop()
        outgoing: asyncio.Queue = asyncio.Queue()

        def work():
            def emit(item):
                loop.call_soon_threadsafe(outgoing.put_nowait, item)
            try:
                path = head.get('path') or '/'
                if not path.startswith('/') or blocked(path):
                    # Drain any body, then refuse.
                    while entry['body'].get(timeout=120) is not None:
                        pass
                    body = b'{"detail":"Only available on the computer running Humperdinck"}'
                    emit(('head', 403, {'content-type': 'application/json'}))
                    emit(('chunk', body))
                    emit(('end',))
                    return
                parts = []
                while True:
                    piece = entry['body'].get(timeout=120)
                    if piece is None:
                        break
                    parts.append(piece)
                body = b''.join(parts)
                headers = {k: v for k, v in (head.get('headers') or {}).items() if k.lower() not in DROP_HEADERS}
                connection = http.client.HTTPConnection('127.0.0.1', local_port, timeout=600)
                connection.request(head.get('method', 'GET'), path, body=body or None, headers=headers)
                response = connection.getresponse()
                out_headers = {k: v for k, v in response.getheaders() if k.lower() not in DROP_HEADERS}
                emit(('head', response.status, out_headers))
                while True:
                    chunk = response.read(CHUNK)
                    if not chunk:
                        break
                    emit(('chunk', chunk))
                connection.close()
                emit(('end',))
            except Exception as error:
                emit(('error', str(error) or 'Request failed on this computer'))

        threading.Thread(target=work, daemon=True, name=f'relay-request-{number}').start()
        try:
            while True:
                item = await outgoing.get()
                if item[0] == 'head':
                    await send(json.dumps({'type': 'response', 'id': number, 'status': item[1], 'headers': item[2]}))
                elif item[0] == 'chunk':
                    await send(frame(number, 1, item[1]))
                elif item[0] == 'end':
                    await send(frame(number, 2))
                    break
                else:
                    await send(json.dumps({'type': 'error', 'id': number, 'message': item[1]}))
                    break
        finally:
            requests.pop(number, None)


relay = Relay()
