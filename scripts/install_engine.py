#!/usr/bin/env python3
"""Install a speech engine into its own environment and optionally download a model.

    python scripts/install_engine.py qwen-torch
    python scripts/install_engine.py chatterbox --model ResembleAI/chatterbox

Works on macOS, Windows and Linux. On Windows/Linux with an NVIDIA GPU, PyTorch is
installed with CUDA support. Lines starting with "STEP " are progress for the app.
"""
import argparse
import os
import shutil
import subprocess
import sys
import venv
from pathlib import Path

root = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(root))
from backend.catalog import ENGINES, supported  # noqa: E402

CUDA_INDEX = 'https://download.pytorch.org/whl/cu124'


def step(message):
    print('STEP ' + message, flush=True)


def python_in(env_dir):
    return env_dir / ('Scripts/python.exe' if sys.platform == 'win32' else 'bin/python')


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('engine', choices=sorted(ENGINES))
    parser.add_argument('--model', help='also download this model for offline use')
    args = parser.parse_args()
    engine = ENGINES[args.engine]
    if not supported(args.engine):
        sys.exit(f"{engine['label']} is not available on this computer.")
    if args.model and args.model not in engine['models']:
        sys.exit(f'{args.model} is not a {engine["label"]} model.')
    if sys.version_info < (3, 11) or sys.version_info >= (3, 13):
        sys.exit('Run this with the Python 3.11/3.12 from .venv (python scripts/install.py creates it).')

    env_dir = root / f".venv-{engine['venv']}"
    python = python_in(env_dir)
    if not python.exists():
        step(f'Creating environment {env_dir.name}')
        venv.create(env_dir, with_pip=True)
    step('Updating pip')
    subprocess.run([str(python), '-m', 'pip', 'install', '-q', '--upgrade', 'pip'], check=True)
    command = [str(python), '-m', 'pip', 'install', *engine['packages']]
    if engine.get('torch') and sys.platform in ('win32', 'linux') and shutil.which('nvidia-smi'):
        # Let pip choose the CUDA build of PyTorch when an NVIDIA GPU is present.
        step('NVIDIA GPU detected: using CUDA-enabled PyTorch')
        command += ['--extra-index-url', CUDA_INDEX]
    step(f"Installing {engine['label']} packages (this can take several minutes)")
    subprocess.run(command, check=True)
    step('Checking the installation')
    imports = '; '.join(f'import {m}' for m in engine['imports'])
    subprocess.run([str(python), '-c', imports], check=True)

    if args.model:
        step(f'Downloading {args.model} (about {engine["models"][args.model]["size_gb"]} GB)')
        env = {k: v for k, v in os.environ.items() if k not in ('HF_HUB_OFFLINE', 'TRANSFORMERS_OFFLINE')}
        subprocess.run([str(python), '-c', 'import sys; from huggingface_hub import snapshot_download; '
                        'snapshot_download(sys.argv[1])', args.model], check=True, env=env)
    step('Done')


if __name__ == '__main__':
    try:
        main()
    except subprocess.CalledProcessError as exc:
        sys.exit(f'Installation step failed (exit code {exc.returncode}). See the messages above.')
