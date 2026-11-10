#!/usr/bin/env python3
"""Exercise the packaged localhost server without invoking Tauri or any AI model."""
from __future__ import annotations

import argparse
import json
import os
import re
from pathlib import Path
import socket
import subprocess
import sys
import tempfile
import time
from urllib.request import urlopen

ROOT = Path(__file__).resolve().parents[1]


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--target", required=True)
    parser.add_argument("--binary", type=Path, help="Test the final Tauri-signed sidecar inside its .app instead of the pre-signing binary")
    args = parser.parse_args()
    ext = ".exe" if "windows" in args.target else ""
    binary = (args.binary.resolve() if args.binary else
              ROOT / "desktop" / "src-tauri" / "binaries" / ("humperdinck-server-" + args.target + ext))
    if not binary.is_file():
        parser.error(f"sidecar missing: {binary}")
    # Verify that the actual bundled uv executable and worker Python sources
    # are present and executable, including after Tauri re-signs the Mac DMG.
    runtime = subprocess.run([str(binary), "--native-runtime-check"],
                             capture_output=True, text=True, timeout=90)
    if runtime.returncode:
        raise RuntimeError("Optional native engine runtime is broken: " +
                           (runtime.stdout + runtime.stderr)[-3000:])

    with socket.socket() as sock:
        sock.bind(("127.0.0.1", 0))
        port = sock.getsockname()[1]
    with tempfile.TemporaryDirectory() as data_dir:
        # PyInstaller --onefile (Mac, Linux) uses a parent bootloader and a
        # child process. Pipes can remain open after terminating only the parent.
        # Write a file instead and terminate the entire process tree.
        log_path = Path(data_dir) / "server.log"
        with log_path.open("wb") as logfile:
            process = subprocess.Popen(
                [str(binary), "--port", str(port), "--data-dir", data_dir],
                stdout=logfile, stderr=subprocess.STDOUT,
                creationflags=(subprocess.CREATE_NEW_PROCESS_GROUP if sys.platform == "win32" else 0),
            )
            try:
                deadline = time.monotonic() + 65
                last_error = ""
                while time.monotonic() < deadline:
                    if process.poll() is not None:
                        break
                    try:
                        with urlopen(f"http://127.0.0.1:{port}/api/health", timeout=2) as response:
                            health = json.load(response)
                        with urlopen(f"http://127.0.0.1:{port}/", timeout=2) as response:
                            page = response.read().decode("utf-8")
                        assert health["application"] == "humperdinck"
                        assert health["native_package"] is True
                        with urlopen(f"http://127.0.0.1:{port}/api/voices", timeout=8) as response:
                            builtin_voices = json.load(response)
                        expected = 7 if health.get("bundled_voices", False) else 0
                        assert len([v for v in builtin_voices if v.get("origin") == "builtin-humperdinck"]) == expected, (
                            f"Expected {expected} Built-In Humperdinck Voices (backend/voice_packs.py switch)"
                        )
                        with urlopen(f"http://127.0.0.1:{port}/api/sound-effects", timeout=8) as response:
                            sounds = json.load(response)
                        assert len([s for s in sounds if s.get("origin") == "curated-cc0"]) == 9, (
                            "Nine curated Humperdinck Sound Effects must be installed before the UI loads"
                        )
                        # GitHub release discovery is allowed to return HTTP 503
                        # when CI has no network access, TLS roots or GitHub
                        # rate limit. Independent unit tests cover release
                        # parsing and trusted download URLs without network.
                        from urllib.error import HTTPError
                        try:
                            with urlopen(f"http://127.0.0.1:{port}/api/updates/check", timeout=12) as response:
                                updates = json.load(response)
                        except HTTPError as update_error:
                            if update_error.code != 503:
                                raise
                            updates = None
                        if updates is not None:
                            assert updates["can_install"] is False
                            assert updates.get("changed_files", []) == [] and updates.get("removed_files", []) == []
                        with urlopen(f"http://127.0.0.1:{port}/api/models", timeout=8) as response:
                            models = json.load(response)
                        assert models["native_package"] is True
                        assert next(e for e in models["engines"] if e["id"] == "kokoro")["installed"]
                        assert "Humperdinck" in page
                        assert 'id="startup-help"' in page, 'Startup fallback missing from packaged HTML'
                        # Loading the HTML alone is not enough: verify Vite's
                        # fingerprinted JavaScript and CSS are actually served.
                        assets = re.findall(r'(?:src|href)="(/assets/[^" ]+)"', page)
                        assert any(asset.endswith('.js') for asset in assets), 'Built JavaScript missing'
                        assert any(asset.endswith('.css') for asset in assets), 'Built CSS missing'
                        for asset in assets:
                            with urlopen(f"http://127.0.0.1:{port}{asset}", timeout=8) as response:
                                content = response.read()
                                content_type = response.headers.get('Content-Type', '')
                            assert len(content) > 100, f'Asset is empty: {asset}'
                            assert 'text/html' not in content_type, f'Asset returned HTML fallback: {asset}'
                        assert (Path(data_dir) / "jobs.sqlite3").exists()
                        print(f"PASS: running sidecar {binary}, backend, static frontend and writable user data")
                        return
                    except (OSError, ValueError, AssertionError) as error:
                        last_error = str(error)
                        time.sleep(0.5)
                logs = log_path.read_text(encoding="utf-8", errors="replace")[-6000:]
                raise RuntimeError(
                    f"Packaged server failed to serve API/UI: {last_error}; exit={process.poll()}\n"
                    f"Binary: {binary}\nSidecar output:\n{logs}"
                )
            finally:
                if sys.platform == "win32":
                    subprocess.run(["taskkill", "/F", "/T", "/PID", str(process.pid)],
                                   capture_output=True, check=False, timeout=20)
                elif process.poll() is None:
                    process.terminate()
                try:
                    process.wait(timeout=12)
                except subprocess.TimeoutExpired:
                    process.kill()
                    process.wait(timeout=12)
        if process.returncode and log_path.is_file():
            print(log_path.read_text(encoding="utf-8", errors="replace")[-4000:])


if __name__ == "__main__":
    main()
