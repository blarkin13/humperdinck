#!/usr/bin/env python3
"""Install a speech engine into its own environment and optionally download a model.

    python scripts/install_engine.py qwen-torch
    python scripts/install_engine.py qwen-torch --model Qwen/Qwen3-TTS-12Hz-0.6B-Base

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

# Official PyTorch 2.15.x wheels are published for CUDA 13.2 / 13.4,
# not cu130 or cu126. Avoid trying CUDA indexes that cannot host the
# installed torch release; older versions retain older CUDA wheel channels.
CUDA_INDEXES_BY_VERSION = {
    15: ('cu132', 'cu134'),
    14: ('cu132', 'cu130', 'cu126'),
}
LEGACY_CUDA_INDEXES = ('cu130', 'cu128', 'cu126', 'cu124', 'cu121')


def cuda_indexes(torch_version):
    """Return only plausible wheel indexes for the installed torch version."""
    from urllib.parse import urlparse
    parts = torch_version.split('.')
    try:
        major, minor = int(parts[0]), int(parts[1])
    except (ValueError, IndexError):
        raise ValueError('Could not determine installed PyTorch version')
    if major != 2:
        raise ValueError(f'Unsupported PyTorch version for automatic CUDA setup: {torch_version}')
    versions = CUDA_INDEXES_BY_VERSION.get(minor, LEGACY_CUDA_INDEXES)
    return [f'https://download.pytorch.org/whl/{tag}' for tag in versions]



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
    """Install the matching CUDA wheel for the existing torch/torchaudio versions.

    Use the per-release CUDA indexes, rather than searching obsolete channels
    for a PyTorch version they never published. A successful pip install does
    not by itself prove that the installed NVIDIA driver can run CUDA.
    """
    probe = 'import torch; print(torch.cuda.is_available())'
    if subprocess.run([str(python), '-c', probe], capture_output=True, text=True).stdout.strip() == 'True':
        step('NVIDIA GPU ready (CUDA PyTorch already installed)')
        return
    detected = subprocess.run([str(python), '-c', VERSIONS_PROBE], capture_output=True, text=True)
    versions = detected.stdout.split()
    if detected.returncode != 0 or not any(v.startswith('torch==') for v in versions):
        step('PyTorch is missing. Cannot configure NVIDIA GPU acceleration.')
        return
    torch_version = next(v.split('==',1)[1] for v in versions if v.startswith('torch=='))
    step(f'NVIDIA GPU detected: looking for CUDA-compatible PyTorch {torch_version} wheels')
    installed = False
    for index in cuda_indexes(torch_version):
        step(f'Trying {index.rsplit("/",1)[-1]}')
        result = subprocess.run(
            [str(python), '-m', 'pip', 'install', '--force-reinstall', '--no-deps', '--quiet',
             *versions, '--index-url', index], capture_output=True, text=True)
        if result.returncode == 0:
            installed = True
            break
        # Avoid dumping many full pip traces. Preserve a brief explanation.
        reason = next((line.strip() for line in reversed(result.stderr.splitlines())
                       if line.strip().startswith('ERROR:')), 'Compatible wheel not found')
        step(f'CUDA channel unavailable: {reason}')
    if not installed:
        step(f'No CUDA wheel found for PyTorch {torch_version}; CPU execution remains available.')
        return
    status = subprocess.run(
        [str(python), '-c',
         'import torch; print(torch.__version__); print(torch.version.cuda); '
         'print(torch.cuda.is_available()); '
         'print(torch.cuda.get_device_name(0) if torch.cuda.is_available() else "")'],
        capture_output=True, text=True)
    lines = status.stdout.strip().splitlines()
    if status.returncode == 0 and len(lines) >= 3 and lines[2] == 'True':
        step(f'NVIDIA GPU ready: {lines[3] if len(lines)>3 else "CUDA enabled"} '
             f'(PyTorch {lines[0]}, CUDA {lines[1]})')
    else:
        step('CUDA-enabled PyTorch installed, but the NVIDIA GPU is not available. '
             'Check the driver version and GPU compatibility with the selected CUDA runtime.')


def install_packages_for_platform(engine_id, packages, platform_name=None):
    """Use prebuilt-only friendly dependencies on Windows for Kokoro.

    Misaki's [ja] extra pulls pyopenjtalk, whose Windows source build requires
    a working MSVC/NMake toolchain. Japanese phonemization can be installed
    separately with appropriate native dependencies; core English/Mandarin
    narration must not depend on compiling pyopenjtalk.
    """
    platform_name = platform_name or sys.platform
    result = list(packages)
    if engine_id == 'kokoro' and platform_name == 'win32':
        result = [p.replace('misaki-fork[ja,zh]', 'misaki-fork[zh]')
                  for p in result]
    return result


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
               *install_packages_for_platform(args.engine, engine['packages'])]
    if args.engine == 'kokoro' and sys.platform == 'win32':
        step('Using Windows-compatible Kokoro dependencies without the Japanese pyopenjtalk source build')
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
