"""SQLite-backed job tracking so job status survives a backend restart."""
import json
import sqlite3
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path
from threading import Lock


def now():
    return datetime.now(timezone.utc).isoformat()


class Job(dict):
    """A job dict that writes itself to the store whenever it changes."""

    def __init__(self, store, data):
        super().__init__(data)
        self._store = store

    def __setitem__(self, key, value):
        super().__setitem__(key, value)
        self._store.save(self)

    def update(self, *args, **kwargs):
        super().update(*args, **kwargs)
        self._store.save(self)


class JobStore:
    def __init__(self, db: Path):
        self.db = db
        self.lock = Lock()
        self.cache = {}
        with self.connect() as c:
            c.execute('''CREATE TABLE IF NOT EXISTS jobs (
                job_id TEXT PRIMARY KEY, data TEXT NOT NULL,
                created_at TEXT NOT NULL, updated_at TEXT NOT NULL)''')
            # Threads do not survive a restart, so unfinished jobs can never complete.
            for row in c.execute("SELECT job_id, data FROM jobs").fetchall():
                data = json.loads(row[1])
                if data.get('status') in ('queued', 'running'):
                    data.update(status='failed', message='Interrupted by a backend restart. Please try again.')
                    c.execute('UPDATE jobs SET data=?, updated_at=? WHERE job_id=?', (json.dumps(data), now(), row[0]))

    @contextmanager
    def connect(self):
        c = sqlite3.connect(self.db, timeout=15)
        try:
            yield c
            c.commit()
        finally:
            c.close()

    def save(self, job):
        stamp = now()
        with self.lock, self.connect() as c:
            c.execute('''INSERT INTO jobs VALUES(?,?,?,?)
                ON CONFLICT(job_id) DO UPDATE SET data=excluded.data, updated_at=excluded.updated_at''',
                      (job['job_id'], json.dumps(dict(job)), stamp, stamp))

    def __setitem__(self, job_id, data):
        job = Job(self, {**data, 'job_id': job_id})
        self.cache[job_id] = job
        self.save(job)

    def get(self, job_id, default=None):
        if job_id in self.cache:
            return self.cache[job_id]
        with self.connect() as c:
            row = c.execute('SELECT data FROM jobs WHERE job_id=?', (job_id,)).fetchone()
        if not row:
            return default
        job = Job(self, json.loads(row[0]))
        self.cache[job_id] = job
        return job

    def __getitem__(self, job_id):
        job = self.get(job_id)
        if job is None:
            raise KeyError(job_id)
        return job

    def __contains__(self, job_id):
        return self.get(job_id) is not None
