"""SQLite-backed designed voice recipes and immutable versions."""
import json
import sqlite3
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path
from uuid import uuid4

FIELDS = ('pitch', 'rasp', 'pace', 'warmth')

def now():
    return datetime.now(timezone.utc).isoformat()

class VoiceLibrary:
    def __init__(self, data: Path):
        self.data = data
        self.db = data / 'voice_library.sqlite3'
        self.samples = data / 'designed_voice_samples'
        self.samples.mkdir(parents=True, exist_ok=True)
        with self.connect() as c:
            c.executescript("""CREATE TABLE IF NOT EXISTS designed_voices (
                id TEXT PRIMARY KEY, name TEXT NOT NULL, active_version INTEGER NOT NULL DEFAULT 1,
                created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
            CREATE TABLE IF NOT EXISTS designed_versions (
                voice_id TEXT NOT NULL REFERENCES designed_voices(id) ON DELETE CASCADE,
                version INTEGER NOT NULL, description TEXT NOT NULL, characteristics TEXT NOT NULL,
                model_id TEXT NOT NULL, created_at TEXT NOT NULL,
                PRIMARY KEY(voice_id, version));
            CREATE TABLE IF NOT EXISTS designed_samples (
                id TEXT PRIMARY KEY, voice_id TEXT NOT NULL, version INTEGER NOT NULL,
                text TEXT NOT NULL, filename TEXT NOT NULL, created_at TEXT NOT NULL,
                FOREIGN KEY(voice_id, version) REFERENCES designed_versions(voice_id, version) ON DELETE CASCADE);
            CREATE TABLE IF NOT EXISTS designed_approved_samples (
                voice_id TEXT NOT NULL, version INTEGER NOT NULL, sample_id TEXT NOT NULL,
                PRIMARY KEY(voice_id, version),
                FOREIGN KEY(voice_id, version) REFERENCES designed_versions(voice_id, version) ON DELETE CASCADE,
                FOREIGN KEY(sample_id) REFERENCES designed_samples(id) ON DELETE CASCADE);
            """)

    @contextmanager
    def connect(self):
        c = sqlite3.connect(self.db, timeout=15)
        c.row_factory = sqlite3.Row
        c.execute('PRAGMA foreign_keys=ON')
        try:
            yield c
            c.commit()
        finally:
            c.close()

    def list(self):
        with self.connect() as c:
            return [dict(r) for r in c.execute('SELECT * FROM designed_voices ORDER BY updated_at DESC')]

    def get(self, voice_id):
        with self.connect() as c:
            row = c.execute('SELECT * FROM designed_voices WHERE id=?', (voice_id,)).fetchone()
            if not row: return None
            result = dict(row)
            result['versions'] = []
            for v in c.execute('SELECT * FROM designed_versions WHERE voice_id=? ORDER BY version DESC', (voice_id,)):
                d = dict(v)
                d['characteristics'] = json.loads(d['characteristics'])
                d['approved_sample_id'] = self._approved_id(c, voice_id, d['version'])
                d['samples'] = [dict(s) for s in c.execute('SELECT * FROM designed_samples WHERE voice_id=? AND version=? ORDER BY created_at DESC', (voice_id,d['version']))]
                result['versions'].append(d)
            return result

    def _approved_id(self, c, voice_id, version):
        row = c.execute('SELECT sample_id FROM designed_approved_samples WHERE voice_id=? AND version=?',
                        (voice_id, version)).fetchone()
        return row['sample_id'] if row else None

    def create(self, name, description, characteristics, model_id):
        voice_id, stamp = uuid4().hex, now()
        with self.connect() as c:
            c.execute('INSERT INTO designed_voices VALUES(?,?,?,?,?)', (voice_id,name,1,stamp,stamp))
            c.execute('INSERT INTO designed_versions VALUES(?,?,?,?,?,?)', (voice_id,1,description,json.dumps(characteristics),model_id,stamp))
        return self.get(voice_id)

    def version(self, voice_id, description, characteristics, model_id):
        with self.connect() as c:
            row = c.execute('SELECT MAX(version) FROM designed_versions WHERE voice_id=?', (voice_id,)).fetchone()
            if row[0] is None: return None
            version = row[0]+1
            stamp = now()
            c.execute('INSERT INTO designed_versions VALUES(?,?,?,?,?,?)', (voice_id,version,description,json.dumps(characteristics),model_id,stamp))
            c.execute('UPDATE designed_voices SET active_version=?,updated_at=? WHERE id=?', (version,stamp,voice_id))
        return self.get(voice_id)

    def activate(self, voice_id, version):
        with self.connect() as c:
            exists = c.execute('SELECT 1 FROM designed_versions WHERE voice_id=? AND version=?', (voice_id,version)).fetchone()
            if not exists: return None
            c.execute('UPDATE designed_voices SET active_version=?,updated_at=? WHERE id=?', (version,now(),voice_id))
        return self.get(voice_id)

    def rename(self, voice_id, name):
        with self.connect() as c:
            c.execute('UPDATE designed_voices SET name=?,updated_at=? WHERE id=?', (name,now(),voice_id))
        return self.get(voice_id)

    def delete(self, voice_id):
        with self.connect() as c:
            existing = c.execute('SELECT 1 FROM designed_voices WHERE id=?', (voice_id,)).fetchone()
            if not existing: return False
            c.execute('DELETE FROM designed_voices WHERE id=?', (voice_id,))
        for f in self.samples.glob(f'{voice_id}_*.wav'):
            f.unlink(missing_ok=True)
        return True

    def sample(self, voice_id, version, text, source):
        sample_id = uuid4().hex
        filename = f'{voice_id}_{version}_{sample_id}.wav'
        target = self.samples / filename
        import shutil
        shutil.copyfile(source, target)
        with self.connect() as c:
            c.execute('INSERT INTO designed_samples VALUES(?,?,?,?,?,?)', (sample_id,voice_id,version,text,filename,now()))
        return {'id':sample_id,'filename':filename,'url':f'/api/designed-samples/{sample_id}'}

    def approve_sample(self, voice_id, version, sample_id):
        """Pin an existing preview to a version for reference-based cloning."""
        with self.connect() as c:
            match = c.execute('SELECT id FROM designed_samples WHERE id=? AND voice_id=? AND version=?',
                              (sample_id, voice_id, version)).fetchone()
            if not match:
                return None
            c.execute('INSERT OR REPLACE INTO designed_approved_samples VALUES(?,?,?)',
                      (voice_id, version, sample_id))
        return {'voice_id':voice_id, 'version':version, 'sample_id':sample_id}

    def approved_sample(self, voice_id, version):
        with self.connect() as c:
            row = c.execute('SELECT sample_id FROM designed_approved_samples WHERE voice_id=? AND version=?',
                            (voice_id, version)).fetchone()
        return self.sample_file(row['sample_id']) if row else None

    def latest_approved(self, voice_id):
        """Return the active approved version, or the newest earlier approved version.

        A draft edit must not make an already-approved voice disappear from narration.
        """
        with self.connect() as c:
            rows = c.execute('''SELECT a.version, a.sample_id, s.filename
                FROM designed_approved_samples AS a
                JOIN designed_samples AS s ON s.id = a.sample_id
                JOIN designed_voices AS v ON v.id = a.voice_id
                WHERE a.voice_id = ?
                ORDER BY (a.version = v.active_version) DESC, a.version DESC
                ''', (voice_id,)).fetchall()
        # Skip approvals whose audio file was removed so an older usable one still works.
        for row in rows:
            file = self.samples / row['filename']
            if file.is_file():
                return {'version': row['version'], 'sample_id': row['sample_id'], 'path': file}
        return None

    def sample_file(self, sample_id):
        with self.connect() as c:
            row = c.execute('SELECT filename FROM designed_samples WHERE id=?', (sample_id,)).fetchone()
        return self.samples / row['filename'] if row else None

def build_instruction(description, characteristics):
    # Neutral slider settings should not alter the user's written description.
    cues=[]
    values = characteristics
    if values['pitch'] < 35: cues.append('Use a lower vocal pitch.')
    elif values['pitch'] > 65: cues.append('Use a higher vocal pitch.')
    if values['rasp'] < 35: cues.append('Keep the vocal texture smooth and clear.')
    elif values['rasp'] > 60: cues.append('Use a noticeable but controlled gravelly texture.')
    if values['pace'] < 40: cues.append('Speak at a relaxed, unhurried pace.')
    elif values['pace'] > 60: cues.append('Speak at a brisk pace.')
    if values['warmth'] < 35: cues.append('Use a cooler, restrained vocal tone.')
    elif values['warmth'] > 65: cues.append('Use a warm, rounded vocal tone.')
    return ' '.join([description.strip(), *cues])
