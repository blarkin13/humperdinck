# Requirements and installation

Supported targets: Windows 10/11, macOS (Intel/Apple Silicon), Linux. This starter has not been validated on all three platforms.

1. Install Python 3.11 or 3.12, Node.js 20+ (including npm), and FFmpeg (ensure each is on PATH).
2. Windows: double-click `install.cmd`; macOS/Linux: `sh install.sh`.
3. Start with `start.cmd` on Windows or `sh start.sh` on macOS/Linux.
4. Open http://127.0.0.1:5173 if it does not open automatically.

The installer creates `.venv`, installs core Python requirements and frontend npm packages. It checks but does not automatically install system-level Node.js, Python, FFmpeg or GPU drivers. These must be installed by the user. Voice synthesis models are not included yet.

GPU notes: NVIDIA CUDA on supported Windows/Linux systems; Apple MPS on supported Apple Silicon systems. Actual backend compatibility must be tested when a voice model is integrated. CPU fallback may be slow.

Privacy: keep the server bound to 127.0.0.1 by default. Do not expose it publicly without authentication and upload limits.
