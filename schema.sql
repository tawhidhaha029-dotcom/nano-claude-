-- Nano Claude v2 — Neon Database Schema
-- Paste into Neon SQL editor and run once

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS nc_users (
  id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name      TEXT NOT NULL DEFAULT 'User',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  last_seen  TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS nc_conversations (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES nc_users(id) ON DELETE CASCADE,
  title      TEXT NOT NULL DEFAULT 'New Chat',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS nc_messages (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id  UUID NOT NULL REFERENCES nc_conversations(id) ON DELETE CASCADE,
  role             TEXT NOT NULL CHECK (role IN ('user','assistant')),
  content          TEXT NOT NULL,
  created_at       TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_conv_user  ON nc_conversations(user_id);
CREATE INDEX IF NOT EXISTS idx_msg_conv   ON nc_messages(conversation_id);
CREATE INDEX IF NOT EXISTS idx_conv_upd   ON nc_conversations(updated_at DESC);

CREATE OR REPLACE FUNCTION touch_conv() RETURNS TRIGGER AS $$
BEGIN UPDATE nc_conversations SET updated_at=NOW() WHERE id=NEW.conversation_id; RETURN NEW; END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_touch_conv ON nc_messages;
CREATE TRIGGER trg_touch_conv AFTER INSERT ON nc_messages FOR EACH ROW EXECUTE FUNCTION touch_conv();
