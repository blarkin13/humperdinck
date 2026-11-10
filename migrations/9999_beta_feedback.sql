-- Private beta reports. Apply through the existing reviewed D1 migration workflow.
-- No email, IP address, raw voice content, or original uploaded filenames.
CREATE TABLE IF NOT EXISTS beta_reports (
 id TEXT PRIMARY KEY,
 user_id TEXT NOT NULL REFERENCES auth_users(id),
 category TEXT NOT NULL CHECK (category IN ('bug','idea','experience')),
 platform TEXT NOT NULL CHECK (platform IN ('windows','macos','linux','browser','other')),
 area TEXT NOT NULL CHECK (area IN ('installer','account','models','voices','narration','video','export','accessibility','other')),
 summary TEXT NOT NULL CHECK (length(summary) BETWEEN 5 AND 120),
 details TEXT NOT NULL CHECK (length(details) BETWEEN 10 AND 2500),
 status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','investigating','fixed','closed')),
 created_at INTEGER NOT NULL,
 updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS beta_reports_by_user_time ON beta_reports(user_id,created_at DESC);
CREATE INDEX IF NOT EXISTS beta_reports_by_status_time ON beta_reports(status,created_at DESC);
CREATE TABLE IF NOT EXISTS beta_screenshots (
 id TEXT PRIMARY KEY,
 report_id TEXT NOT NULL REFERENCES beta_reports(id) ON DELETE CASCADE,
 object_key TEXT NOT NULL UNIQUE,
 width INTEGER NOT NULL,
 height INTEGER NOT NULL,
 created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS beta_screenshots_by_report ON beta_screenshots(report_id,created_at);
