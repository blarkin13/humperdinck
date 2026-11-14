"""Remote access through a Cloudflare quick tunnel.

`cloudflared` makes an outbound, encrypted connection to Cloudflare and gets a
random https://*.trycloudflare.com address that forwards to the network
server. No router changes, account or extra app on the other device. The
network server's access code still protects every request.

Quick tunnels are free and anonymous; the address changes on every start.
"""
from __future__ import annotations

import os
import platform
import re
import shutil
import stat
import subprocess
import tarfile
import tempfile
import threading
import time
import urllib.request
from pathlib import Path

RELEASES = 'https://github.com/cloudflare/cloudflared/releases/latest/download/'
URL_PATTERN = re.compile(r'https://[a-z0-9-]+\.trycloudflare\.com')


def _asset() -> str:
    machine = platform.machine().lower()
    arch = 'arm64' if machine in ('arm64', 'aarch64') else 'amd64'
    system = platform.system()
    if system == 'Darwin':
        return f'cloudflared-darwin-{arch}.tgz'
    if system == 'Windows':
        return 'cloudflared-windows-amd64.exe'
    return f'cloudflared-linux-{arch}'


class RemoteTunnel:
    def __init__(self):
        self._lock = threading.Lock()
        self._process = None
        self.url = ''
        self.error = ''
        self.state = 'off'  # off, installing, starting, on

    def binary(self, data: Path) -> Path | None:
        name = 'cloudflared.exe' if os.name == 'nt' else 'cloudflared'
        local = data / 'tools' / name
        if local.is_file():
            return local
        found = shutil.which('cloudflared')
        return Path(found) if found else None

    def install(self, data: Path) -> Path:
        tools = data / 'tools'
        tools.mkdir(parents=True, exist_ok=True)
        asset = _asset()
        target = tools / ('cloudflared.exe' if os.name == 'nt' else 'cloudflared')
        with tempfile.TemporaryDirectory(dir=tools) as work:
            download = Path(work) / asset
            request = urllib.request.Request(RELEASES + asset, headers={'User-Agent': 'Humperdinck'})
            with urllib.request.urlopen(request, timeout=120) as response, open(download, 'wb') as out:
                shutil.copyfileobj(response, out)
            if asset.endswith('.tgz'):
                with tarfile.open(download) as archive:
                    member = next(m for m in archive.getmembers() if m.isfile() and Path(m.name).name == 'cloudflared')
                    source = archive.extractfile(member)
                    extracted = Path(work) / 'cloudflared'
                    with open(extracted, 'wb') as out:
                        shutil.copyfileobj(source, out)
                download = extracted
            download.chmod(download.stat().st_mode | stat.S_IXUSR | stat.S_IXGRP | stat.S_IXOTH)
            check = subprocess.run([str(download), '--version'], capture_output=True, text=True, timeout=20)
            if check.returncode != 0 or 'cloudflared' not in (check.stdout + check.stderr).lower():
                raise RuntimeError('The downloaded remote access tool did not run correctly')
            os.replace(download, target)
        return target

    @property
    def running(self) -> bool:
        return bool(self._process and self._process.poll() is None and self.url)

    def status(self) -> dict:
        if self._process and self._process.poll() is not None and self.state == 'on':
            self.state, self.url = 'off', ''
            self.error = 'Remote access stopped unexpectedly. Start it again.'
        return {'state': self.state, 'url': self.url, 'error': self.error}

    def start(self, data: Path, port: int) -> None:
        with self._lock:
            if self.running:
                return
            self._stop_locked()
            self.error = ''
            try:
                tool = self.binary(data)
                if not tool:
                    self.state = 'installing'
                    tool = self.install(data)
                self.state = 'starting'
                flags = subprocess.CREATE_NO_WINDOW if os.name == 'nt' else 0
                process = subprocess.Popen(
                    [str(tool), 'tunnel', '--no-autoupdate', '--url', f'http://127.0.0.1:{port}'],
                    stdout=subprocess.DEVNULL, stderr=subprocess.PIPE, text=True, creationflags=flags)
                self._process = process
                found = {}

                def read():
                    for line in process.stderr:
                        match = URL_PATTERN.search(line)
                        if match and 'url' not in found:
                            found['url'] = match.group(0)
                threading.Thread(target=read, daemon=True, name='remote-tunnel-log').start()
                deadline = time.monotonic() + 45
                while 'url' not in found and process.poll() is None and time.monotonic() < deadline:
                    time.sleep(0.2)
                if 'url' not in found:
                    self._stop_locked()
                    raise RuntimeError('Could not reach Cloudflare to open remote access. Check the internet connection.')
                self.url, self.state = found['url'], 'on'
            except Exception as error:
                self.state, self.url = 'off', ''
                self.error = str(error) or 'Remote access failed to start'
                raise RuntimeError(self.error) from error

    def stop(self) -> None:
        with self._lock:
            self._stop_locked()
            self.error = ''

    def _stop_locked(self) -> None:
        if self._process and self._process.poll() is None:
            self._process.terminate()
            try:
                self._process.wait(timeout=5)
            except subprocess.TimeoutExpired:
                self._process.kill()
        self._process = None
        self.url, self.state = '', 'off'


tunnel = RemoteTunnel()
