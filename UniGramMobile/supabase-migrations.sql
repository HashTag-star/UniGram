-- ============================================================
-- UniGram — Supabase Schema Migrations
-- Run this in the Supabase SQL editor (Dashboard → SQL Editor)
-- to ensure all required tables and columns exist.
-- Safe to run multiple times (all statements use IF NOT EXISTS /
-- ON CONFLICT DO NOTHING / OR REPLACE).
-- ============================================================

-- ────────────────────────────────────────────────────────────
-- 1. Add missing columns to existing tables
-- ────────────────────────────────────────────────────────────

-- Admin + moderation flags on profiles
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS is_admin  BOOLEAN DEFAULT false;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS is_banned BOOLEAN DEFAULT false;

-- Rich message types (image / gif support)
ALTER TABLE messages ADD COLUMN IF NOT EXISTS type      TEXT DEFAULT 'text'
  CHECK (type IN ('text', 'image', 'gif'));
ALTER TABLE messages ADD COLUMN IF NOT EXISTS media_url TEXT;

-- Market enhancements
ALTER TABLE market_items ADD COLUMN IF NOT EXISTS views_count INTEGER DEFAULT 0;

-- Optional post enhancement (linked song preview)
ALTER TABLE posts ADD COLUMN IF NOT EXISTS song_preview_url TEXT;

-- ────────────────────────────────────────────────────────────
-- 2. Create message_reactions table
-- ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS message_reactions (
  id         UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  message_id UUID        REFERENCES messages(id) ON DELETE CASCADE,
  user_id    UUID        REFERENCES profiles(id) ON DELETE CASCADE,
  emoji      TEXT        NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(message_id, user_id, emoji)
);

-- ────────────────────────────────────────────────────────────
-- 3. Create market_saves table
-- ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS market_saves (
  id         UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id    UUID        REFERENCES profiles(id)      ON DELETE CASCADE,
  item_id    UUID        REFERENCES market_items(id)  ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, item_id)
);

-- ────────────────────────────────────────────────────────────
-- 4. Create reports table
-- ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS reports (
  id          UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  reporter_id UUID        REFERENCES profiles(id),
  target_type TEXT        NOT NULL
    CHECK (target_type IN ('post', 'user', 'reel', 'market_item')),
  target_id   UUID        NOT NULL,
  reason      TEXT        NOT NULL,
  description TEXT,
  status      TEXT        DEFAULT 'pending'
    CHECK (status IN ('pending', 'reviewed', 'dismissed')),
  created_at  TIMESTAMPTZ DEFAULT now()
);

-- ────────────────────────────────────────────────────────────
-- 5. Row-Level Security
-- ────────────────────────────────────────────────────────────

-- message_reactions
ALTER TABLE message_reactions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can manage own reactions" ON message_reactions;
CREATE POLICY "Users can manage own reactions"
  ON message_reactions FOR ALL
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can view reactions" ON message_reactions;
CREATE POLICY "Users can view reactions"
  ON message_reactions FOR SELECT
  USING (true);

-- market_saves
ALTER TABLE market_saves ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can manage own saves" ON market_saves;
CREATE POLICY "Users can manage own saves"
  ON market_saves FOR ALL
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can view own saves" ON market_saves;
CREATE POLICY "Users can view own saves"
  ON market_saves FOR SELECT
  USING (auth.uid() = user_id);

-- reports
ALTER TABLE reports ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can create reports" ON reports;
CREATE POLICY "Users can create reports"
  ON reports FOR INSERT
  WITH CHECK (auth.uid() = reporter_id);

DROP POLICY IF EXISTS "Admins can view all reports" ON reports;
CREATE POLICY "Admins can view all reports"
  ON reports FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND is_admin = true
    )
  );

-- ────────────────────────────────────────────────────────────
-- 6. Storage bucket for message media
-- ────────────────────────────────────────────────────────────

INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('message-media', 'message-media', true, 52428800)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "Authenticated users can upload message media"
  ON storage.objects;
CREATE POLICY "Authenticated users can upload message media"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'message-media'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

DROP POLICY IF EXISTS "Anyone can view message media" ON storage.objects;
CREATE POLICY "Anyone can view message media"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'message-media');

-- ────────────────────────────────────────────────────────────
-- 7. Create verification_requests table + RLS
-- ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS verification_requests (
  id               UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id          UUID        REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  type             TEXT        NOT NULL
    CHECK (type IN ('student', 'professor', 'club', 'influencer', 'staff')),
  status           TEXT        DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'rejected')),
  full_name        TEXT        NOT NULL,
  email            TEXT        NOT NULL,
  reason           TEXT        NOT NULL,
  document_urls    TEXT[]      DEFAULT '{}',
  submitted_at     TIMESTAMPTZ DEFAULT now(),
  rejection_reason TEXT
);

ALTER TABLE verification_requests ENABLE ROW LEVEL SECURITY;

-- Users can submit their own request
DROP POLICY IF EXISTS "Users can insert own verification requests" ON verification_requests;
CREATE POLICY "Users can insert own verification requests"
  ON verification_requests FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Users can view their own requests (to check status)
DROP POLICY IF EXISTS "Users can view own verification requests" ON verification_requests;
CREATE POLICY "Users can view own verification requests"
  ON verification_requests FOR SELECT
  USING (auth.uid() = user_id);

-- Admins can view ALL requests
DROP POLICY IF EXISTS "Admins can view all verification requests" ON verification_requests;
CREATE POLICY "Admins can view all verification requests"
  ON verification_requests FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND is_admin = true
    )
  );

-- Admins can update requests (approve / reject)
DROP POLICY IF EXISTS "Admins can update verification requests" ON verification_requests;
CREATE POLICY "Admins can update verification requests"
  ON verification_requests FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND is_admin = true
    )
  );

-- Storage bucket for verification documents (public read, auth upload)
INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('verifications', 'verifications', true, 10485760)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "Authenticated users can upload verification docs" ON storage.objects;
CREATE POLICY "Authenticated users can upload verification docs"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'verifications');

DROP POLICY IF EXISTS "Anyone can view verification docs" ON storage.objects;
CREATE POLICY "Anyone can view verification docs"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'verifications');

-- ────────────────────────────────────────────────────────────
-- 8. Trigger: update conversation last_message on insert
-- ────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION update_conversation_last_message()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE conversations
  SET
    last_message    = CASE WHEN NEW.type = 'image' THEN '📷 Image' ELSE NEW.text END,
    last_message_at = NEW.created_at
  WHERE id = NEW.conversation_id;

  -- Increment unread count for all participants except the sender
  UPDATE conversation_participants
  SET unread_count = COALESCE(unread_count, 0) + 1
  WHERE conversation_id = NEW.conversation_id
    AND user_id != NEW.sender_id;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_message_insert ON messages;
CREATE TRIGGER on_message_insert
  AFTER INSERT ON messages
  FOR EACH ROW EXECUTE FUNCTION update_conversation_last_message();

-- ────────────────────────────────────────────────────────────
-- Done. All migrations applied successfully.
-- ────────────────────────────────────────────────────────────
-- ────────────────────────────────────────────────────────────
