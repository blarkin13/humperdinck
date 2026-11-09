"""Benchmark engine-pool overhead with real Kokoro: voice switching and repeat calls.

Usage: python scripts/bench_engines.py [rounds]
Prints wall time per call so worker restarts (model reloads) are visible.
"""
import sys
import tempfile
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from backend import engines  # noqa: E402

TEXT = 'The lighthouse keeper climbed the stairs one more time before the storm.'
VOICES = ['af_heart', 'am_michael', 'bf_emma']


def timed(label, voice, out):
    start = time.perf_counter()
    engines.preset('kokoro', voice, out, TEXT)
    took = time.perf_counter() - start
    print(f'{label:<28} {voice:<11} {took:6.2f} s')
    return took


def main(rounds=2):
    with tempfile.TemporaryDirectory() as folder:
        out = Path(folder) / 'x.wav'
        timed('cold start', VOICES[0], out)
        same = [timed('same voice again', VOICES[0], out) for _ in range(rounds)]
        switch = [timed('switch voice', VOICES[(i % (len(VOICES) - 1)) + 1], out) for i in range(rounds * 2)]
        print(f'\nmean same-voice {sum(same)/len(same):.2f} s | mean voice-switch {sum(switch)/len(switch):.2f} s')
    engines.pool.shutdown()


if __name__ == '__main__':
    main(int(sys.argv[1]) if len(sys.argv) > 1 else 2)
