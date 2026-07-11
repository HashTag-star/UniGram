-- 037: notifications constraint, message-media bucket, ai_action_log table, realtime publication
-- [Kofi Asante - Backend] Closes P0/P1 follow-ups from the backend audit:
--   1. notifications_type_check is missing 're_engagement' — the cron-driven
--      send-reengagement-notifications function inserts that type and the
--      check fails silently, so users get no cooldown row and could be
--      pushed unlimited times.
--   2. services/messages.ts uploads voice/image into a `message-media`
--      bucket that 035_init_storage.sql never created.
--   3. supabase/functions/ai-regulation-scan writes to ai_action_log but
--      no migration created that table; the .catch(() => {}) swallows the
--      failure so admin-AI moderation actions are silently un-logged.
--   4. App.tsx subscribes to notifications/messages/calls/call_ice_candidates
--      via supabase.channel() but only live_comments/live_sessions are in
--      the realtime publication (added in 004). Without these the badge
--      and DM realtime do nothing.

-- ── 1. notifications_type_check: add 're_engagement' ─────────────────────────
ALTER TABLE public.notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
ALTER TABLE public.notifications
  ADD CONSTRAINT notifications_type_check
  CHECK (type IN (
    'like', 'comment', 'follow', 'mention', 'repost', 'quote', 'save',
    'live_started', 'live_ended', 'reel_like', 'reel_comment',
    'follow_suggestion', 'new_post', 'new_story', 'message', 'story_view',
    're_engagement',
    'admin_report', 'admin_verification', 'admin_ban',
    'verification_approved', 'verification_rejected',
    'announcement', 'account_suspended', 'account_unsuspended'
  ));

-- ── 2. message-media storage bucket ──────────────────────────────────────────
INSERT INTO storage.buckets (id, name, public)
VALUES ('message-media', 'message-media', true)
ON CONFLICT (id) DO UPDATE SET public = EXCLUDED.public;

DROP POLICY IF EXISTS "message_media_public_read" ON storage.objects;
CREATE POLICY "message_media_public_read"
  ON storage.objects FOR SELECT USING (bucket_id = 'message-media');

DROP POLICY IF EXISTS "message_media_auth_insert" ON storage.objects;
CREATE POLICY "message_media_auth_insert"
  ON storage.objects FOR INSERT WITH CHECK (
    bucket_id = 'message-media' AND auth.role() = 'authenticated'
  );

DROP POLICY IF EXISTS "message_media_owner_delete" ON storage.objects;
CREATE POLICY "message_media_owner_delete"
  ON storage.objects FOR DELETE USING (
    bucket_id = 'message-media' AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- ── 3. ai_action_log table ───────────────────────────────────────────────────
-- ai-regulation-scan inserts per-action rows describing what the AI did
-- (ban, unban, delete content, etc.). Keep the schema minimal — admin
-- dashboards can join to profiles/posts/reports for context.

CREATE TABLE IF NOT EXISTS public.ai_action_log (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  action_type  TEXT NOT NULL,
  target_type  TEXT,
  target_id    UUID,
  reason       TEXT,
  metadata     JSONB DEFAULT '{}'::jsonb,
  acted_by     TEXT NOT NULL DEFAULT 'ai-regulation-scan',
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ai_action_log_created_at
  ON public.ai_action_log (created_at DESC);

ALTER TABLE public.ai_action_log ENABLE ROW LEVEL SECURITY;

-- Only admins can read; service_role bypasses RLS so the edge function
-- can always insert.
DROP POLICY IF EXISTS "ai_action_log_admin_read" ON public.ai_action_log;
CREATE POLICY "ai_action_log_admin_read" ON public.ai_action_log
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND is_admin = true
  ));

-- ── 4. Realtime publication: add app-critical tables ─────────────────────────
-- ALTER PUBLICATION ... ADD TABLE is not idempotent; guard with a DO block.
DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['notifications', 'messages', 'calls', 'call_ice_candidates']
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime'
        AND schemaname = 'public'
        AND tablename = t
    ) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', t);
    END IF;
  END LOOP;
END $$;
