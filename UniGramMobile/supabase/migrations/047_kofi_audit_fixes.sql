-- Migration 043: Kofi's Audit Fixes
-- 1. Create missing public.ai_action_log table referenced by the ai-regulation-scan edge function.
-- 2. Expand notifications_type_check constraint to include 're_engagement' and admin actions.

-- ── 1. Create ai_action_log ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.ai_action_log (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  action_type TEXT NOT NULL,
  target_id UUID NOT NULL,
  target_type TEXT NOT NULL,
  confidence DOUBLE PRECISION NOT NULL,
  ai_reason TEXT,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- Enable Row Level Security (RLS)
ALTER TABLE public.ai_action_log ENABLE ROW LEVEL SECURITY;

-- Allow authenticated admins to view the AI action logs
DROP POLICY IF EXISTS "Admins can view ai_action_log" ON public.ai_action_log;
CREATE POLICY "Admins can view ai_action_log"
  ON public.ai_action_log
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND is_admin = true
    )
  );

-- ── 2. Fix notifications_type_check check constraint ──────────────────────────
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
