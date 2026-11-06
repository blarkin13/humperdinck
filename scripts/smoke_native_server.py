#!/usr/bin/env python3
"""Exercise the packaged localhost server without invoking Tauri or any AI model."""
from __future__ import annotations

import argparse
import json
import os
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
    args = parser.parse_args()
    ext = ".exe" if "windows" in args.target else ""
    binary = ROOT / "desktop" / "src-tauri" / "binaries" / ("humperdinck-server-" + args.target + ext)
    if not binary.is_file():
        parser.error(f"sidecar missing: {binary}")

    with socket.socket() as sock:
        sock.bind(("127.0.0.1", 0))
        port = sock.getsockname()[1]
    with tempfile.TemporaryDirectory() as data_dir:
        # PyInstaller --onefile uses a parent bootloader and a child process on
        # Windows. Pipes can remain open after terminating only the parent.
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
                        assert "Humperdinck" in page
                        assert (Path(data_dir) / "jobs.sqlite3").exists()
                        print("PASS: packaged backend, static frontend and writable user data")
                        return
                    except (OSError, ValueError, AssertionError) as error:
                        last_error = str(error)
                        time.sleep(0.5)
                raise RuntimeError(f"Packaged server failed to serve API/UI: {last_error}; exit={process.poll()}")
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
