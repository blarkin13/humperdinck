"""Contract-check the beta feedback migration against SQLite without touching real D1."""
import pathlib
import sqlite3
import unittest

ROOT = pathlib.Path(__file__).resolve().parents[1]
MIGRATION = ROOT / "migrations" / "9999_beta_feedback.sql"


class BetaSchemaTests(unittest.TestCase):
    def setUp(self):
        self.db = sqlite3.connect(":memory:")
        self.db.execute("PRAGMA foreign_keys = ON")
        self.db.execute("CREATE TABLE auth_users (id TEXT PRIMARY KEY)")
        self.db.execute("INSERT INTO auth_users(id) VALUES ('beta-user')")
        self.db.executescript(MIGRATION.read_text(encoding="utf-8"))

    def tearDown(self):
        self.db.close()

    def test_tables_indexes_and_status(self):
        tables = {row[0] for row in self.db.execute("SELECT name FROM sqlite_master WHERE type='table'")}
        self.assertIn("beta_reports", tables)
        self.assertIn("beta_screenshots", tables)
        indexes = {row[0] for row in self.db.execute("SELECT name FROM sqlite_master WHERE type='index'")}
        self.assertIn("beta_reports_by_user_time", indexes)
        self.assertIn("beta_screenshots_by_report", indexes)
        self.db.execute("""INSERT INTO beta_reports
          (id,user_id,category,platform,area,summary,details,created_at,updated_at)
          VALUES ('report-1','beta-user','bug','windows','narration','test heading','some fictional details',1,1)""")
        self.assertEqual(self.db.execute("SELECT status FROM beta_reports").fetchone()[0], "open")

    def test_bad_category_and_missing_user_rejected(self):
        base = """INSERT INTO beta_reports
          (id,user_id,category,platform,area,summary,details,created_at,updated_at)
          VALUES (?,?,?,?,?,?,?,?,?)"""
        with self.assertRaises(sqlite3.IntegrityError):
            self.db.execute(base, ("bad", "beta-user", "harmful", "macos", "other", "test summary", "fictional details", 1, 1))
        with self.assertRaises(sqlite3.IntegrityError):
            self.db.execute(base, ("bad", "unknown", "bug", "macos", "other", "test summary", "fictional details", 1, 1))

    def test_screenshot_delete_cascade(self):
        self.db.execute("""INSERT INTO beta_reports
          (id,user_id,category,platform,area,summary,details,created_at,updated_at)
          VALUES ('report-1','beta-user','bug','windows','narration','test heading','some fictional details',1,1)""")
        self.db.execute("""INSERT INTO beta_screenshots
          (id,report_id,object_key,width,height,created_at)
          VALUES ('image-1','report-1','beta/report-1/image-1.png',100,100,1)""")
        self.db.execute("DELETE FROM beta_reports WHERE id='report-1'")
        self.assertEqual(self.db.execute("SELECT COUNT(*) FROM beta_screenshots").fetchone()[0], 0)


if __name__ == "__main__":
    unittest.main()
