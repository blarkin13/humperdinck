"""Warm worker pool tests using real worker processes with the fake engine."""
import time

import pytest

from backend import engines


@pytest.fixture
def pool(monkeypatch):
    monkeypatch.setenv('HUMPERDINCK_FAKE_ENGINE', '1')
    monkeypatch.setattr(engines, '_resolved', {})
    p = engines.Pool()
    yield p
    p.shutdown()


def run(pool, engine, tmp_path, text='Hello.'):
    output = tmp_path / f'{engine}-{time.monotonic_ns()}.wav'
    pool.synthesize(engine, {'engine': engine, 'text': text, 'description': 'd',
                             'reference': str(tmp_path / 'ref.wav'), 'output': str(output)})
    assert output.is_file()


def test_worker_is_reused_between_jobs(pool, tmp_path):
    run(pool, 'chatterbox', tmp_path)
    pid = pool.worker.process.pid
    run(pool, 'chatterbox', tmp_path)
    assert pool.worker.process.pid == pid
    assert pool.status()['engine'] == 'chatterbox' and pool.status()['loaded']


def test_switching_engine_stops_the_other_one(pool, tmp_path):
    run(pool, 'chatterbox', tmp_path)
    first = pool.worker
    run(pool, 'qwen', tmp_path)
    assert not first.alive()
    assert pool.worker.engine == 'qwen'


def test_idle_worker_exits(pool, tmp_path, monkeypatch):
    monkeypatch.setenv('HUMPERDINCK_IDLE_TIMEOUT_S', '0.3')
    run(pool, 'chatterbox', tmp_path)
    worker = pool.worker
    for _ in range(50):
        if pool.status() is None:
            break
        time.sleep(0.1)
    assert pool.status() is None and not worker.alive()


def test_stalled_job_is_killed_and_next_job_recovers(pool, tmp_path, monkeypatch):
    monkeypatch.setenv('HUMPERDINCK_STALL_TIMEOUT_S', '0.5')
    run(pool, 'chatterbox', tmp_path)  # loaded, so the stall budget applies
    with pytest.raises(RuntimeError, match='stopped responding'):
        run(pool, 'chatterbox', tmp_path, 'sleep:5')
    assert pool.status() is None
    run(pool, 'chatterbox', tmp_path)


def test_crashed_worker_reports_and_restarts(pool, tmp_path):
    with pytest.raises(RuntimeError, match='exited unexpectedly'):
        run(pool, 'chatterbox', tmp_path, 'crash')
    run(pool, 'chatterbox', tmp_path)
