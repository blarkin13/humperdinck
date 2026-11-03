#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
if [[ "$(uname -s)" != Darwin || "$(uname -m)" != arm64 ]]; then
  echo 'Qwen MLX installer requires Apple Silicon macOS.' >&2
  exit 1
fi
if [[ ! -x .venv/bin/python ]]; then
  echo 'Run bash install.sh first.' >&2
  exit 1
fi
.venv/bin/python -m pip install --upgrade pip
.venv/bin/python -m pip install 'mlx-audio' 'soundfile>=0.12' 'numpy>=1.24,<3'
echo 'Qwen MLX dependencies installed. Model weights download on first generation.'
echo 'An 8 GB Mac may run out of unified memory; start with a single short sentence.'
