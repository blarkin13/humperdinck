-- Owner-only support inbox (inactive until SUPPORT_MAIL_INBOX_ENABLED=true).
-- Contains customer correspondence: do not enable without an approved retention policy.
CREATE TABLE IF NOT EXISTS support_mail_threads (
 id TEXT PRIMARY KEY,
 alias TEXT NOT NULL CHECK(alias IN ('support@humperdinck.studio','billing@humperdinck.studio','privacy@humperdinck.studio','legal@humperdinck.studio')),
 contact_email TEXT NOT NULL,
 subject TEXT NOT NULL,
 status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open','closed')),
 created_at INTEGER NOT NULL,
 updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS support_mail_threads_updated_idx ON support_mail_threads(updated_at DESC);
CREATE TABLE IF NOT EXISTS support_mail_messages (
 id TEXT PRIMARY KEY,
 thread_id TEXT NOT NULL REFERENCES support_mail_threads(id) ON DELETE CASCADE,
 direction TEXT NOT NULL CHECK(direction IN ('incoming','outgoing')),
 sender TEXT NOT NULL,
 recipient TEXT NOT NULL,
 subject TEXT NOT NULL,
 body_text TEXT NOT NULL,
 message_id TEXT,
 in_reply_to TEXT,
 provider_id TEXT,
 raw_key TEXT,
 raw_size INTEGER,
 status TEXT NOT NULL CHECK(status IN ('received','pending','sent','failed','unknown')),
 created_at INTEGER NOT NULL,
 updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS support_mail_messages_thread_idx ON support_mail_messages(thread_id,created_at,id);
CREATE UNIQUE INDEX IF NOT EXISTS support_mail_messages_inbound_dedupe
 ON support_mail_messages(recipient,message_id) WHERE direction='incoming' AND message_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS support_mail_messages_outgoing_daily
 ON support_mail_messages(direction,created_at,status);
