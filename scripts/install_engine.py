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
from backend.catalog import ENGINES, supported, preset_path  # noqa: E402

# Newest first: the first index that has a CUDA build of the PyTorch version the engine needs is used.
CUDA_INDEXES = [f'https://download.pytorch.org/whl/{tag}' for tag in ('cu130', 'cu129', 'cu128', 'cu126', 'cu124', 'cu121')]


def step(message):
    print('STEP ' + message, flush=True)


def python_in(env_dir):
    return env_dir / ('Scripts/python.exe' if sys.platform == 'win32' else 'bin/python')


# Prints e.g. "torch==2.6.0 torchaudio==2.6.0" for the PyTorch packages that are installed.
VERSIONS_PROBE = """
import importlib.metadata as m
for name in ('torch', 'torchaudio'):
    try:
        print(name + '==' + m.version(name).split('+')[0])
    except m.PackageNotFoundError:
        pass
"""


def use_cuda(python):
    """Swap in the CUDA build of the PyTorch version the engine installed.

    pip installs the CPU-only PyTorch from PyPI on Windows, and an extra CUDA index does not
    help because pip prefers PyPI's newer version number. So reinstall the same versions
    explicitly from PyTorch's CUDA index.
    """
    probe = 'import torch; print(torch.cuda.is_available())'
    if subprocess.run([str(python), '-c', probe], capture_output=True, text=True).stdout.strip() == 'True':
        step('NVIDIA GPU ready (CUDA PyTorch already installed)')
        return
    versions = subprocess.run([str(python), '-c', VERSIONS_PROBE], capture_output=True, text=True).stdout.split()
    step('NVIDIA GPU detected: installing the GPU (CUDA) build of PyTorch, about 2.5 GB')
    for index in CUDA_INDEXES:
        if subprocess.run([str(python), '-m', 'pip', 'install', '--force-reinstall', '--no-deps', *versions,
                           '--index-url', index]).returncode == 0:
            break
    ok = subprocess.run([str(python), '-c', 'import torch; print(torch.cuda.is_available() and torch.cuda.get_device_name(0))'],
                        capture_output=True, text=True).stdout.strip()
    step(f'Using GPU: {ok}' if ok and ok != 'False' else
         'Could not enable the NVIDIA GPU; the engine will run on the CPU. Updating the NVIDIA driver usually fixes this.')


def download_kokoro():
    """Fetch pinned ONNX + voicepack release files atomically into protected data/."""
    import urllib.request
    folder = preset_path('kokoro', '')
    folder.mkdir(parents=True, exist_ok=True)
    base = 'https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.1/'
    for name, minimum in (('kokoro-v1.0.onnx', 50_000_000), ('voices-v1.0.bin', 1_000_000)):
        target = folder / name
        if target.is_file() and target.stat().st_size >= minimum:
            continue
        step(f'Downloading Kokoro {name}')
        temp = folder / (name + '.part')
        try:
            with urllib.request.urlopen(base + name, timeout=60) as response, temp.open('wb') as output:
                shutil.copyfileobj(response, output)
                expected = response.headers.get('Content-Length')
                if expected and output.tell() != int(expected):
                    raise RuntimeError(f'Incomplete download of {name}')
            if temp.stat().st_size < minimum:
                raise RuntimeError(f'Kokoro file {name} is incomplete')
            temp.replace(target)
        finally:
            temp.unlink(missing_ok=True)


def download_piper(python, voice):
    folder = preset_path('piper', voice)
    folder.mkdir(parents=True, exist_ok=True)
    step(f'Downloading Piper voice {voice}')
    subprocess.run([str(python), '-m', 'piper.download_voices', voice,
                    '--download-dir', str(folder)], check=True)


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
    # The MLX Qwen speech decoder has changed across mlx-audio releases.
    # Re-running Install/Repair must refresh the engine rather than accept an
    # already-installed but incompatible mlx-audio package.
    command = [str(python), '-m', 'pip', 'install',
               *(['--upgrade'] if args.engine == 'qwen-mlx' else []),
               *engine['packages']]
    step(f"Installing {engine['label']} packages (this can take several minutes)")
    subprocess.run(command, check=True)
    if engine.get('torch') and sys.platform in ('win32', 'linux') and shutil.which('nvidia-smi'):
        use_cuda(python)
    step('Checking the installation')
    imports = '; '.join(f'import {m}' for m in engine['imports'])
    subprocess.run([str(python), '-c', imports], check=True)

    if args.model:
        if args.engine == 'kokoro':
            download_kokoro()
        elif args.engine == 'piper':
            download_piper(python, args.model)
        else:
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
