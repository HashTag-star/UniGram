-- ============================================================
-- 004_live_streaming.sql
-- Tables and functions for real-time live streaming
-- ============================================================

-- 1. Live Sessions
CREATE TABLE IF NOT EXISTS public.live_sessions (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  creator_id uuid REFERENCES profiles(id) ON DELETE CASCADE,
  started_at timestamptz DEFAULT now(),
  ended_at timestamptz,
  status text DEFAULT 'live', -- 'live', 'ended'
  viewer_count int DEFAULT 0,
  title text
);

-- 2. Live Comments
CREATE TABLE IF NOT EXISTS public.live_comments (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  session_id uuid REFERENCES live_sessions(id) ON DELETE CASCADE,
  user_id uuid REFERENCES profiles(id) ON DELETE CASCADE,
  text text NOT NULL,
  created_at timestamptz DEFAULT now()
);

-- Indices for performance
CREATE INDEX IF NOT EXISTS idx_live_comments_session ON public.live_comments(session_id);
CREATE INDEX IF NOT EXISTS idx_live_sessions_creator ON public.live_sessions(creator_id);

-- 3. RLS Policies
ALTER TABLE public.live_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.live_comments ENABLE ROW LEVEL SECURITY;

-- Sessions: Anyone authenticated can read; creators can insert/update
DROP POLICY IF EXISTS "anyone can see live sessions" ON public.live_sessions;
CREATE POLICY "anyone can see live sessions" 
  ON public.live_sessions FOR SELECT 
  USING (true);

DROP POLICY IF EXISTS "users can start sessions" ON public.live_sessions;
CREATE POLICY "users can start sessions" 
  ON public.live_sessions FOR INSERT 
  WITH CHECK (auth.uid() = creator_id);

DROP POLICY IF EXISTS "creators can end sessions" ON public.live_sessions;
CREATE POLICY "creators can end sessions" 
  ON public.live_sessions FOR UPDATE 
  USING (auth.uid() = creator_id);

-- Comments: Anyone authenticated can read and insert; creators can delete
DROP POLICY IF EXISTS "anyone can read live comments" ON public.live_comments;
CREATE POLICY "anyone can read live comments" 
  ON public.live_comments FOR SELECT 
  USING (true);

DROP POLICY IF EXISTS "authenticated users can post live comments" ON public.live_comments;
CREATE POLICY "authenticated users can post live comments" 
  ON public.live_comments FOR INSERT 
  WITH CHECK (auth.uid() = user_id);

-- 4. Viewer Count Function
CREATE OR REPLACE FUNCTION increment_viewer_count(p_session_id uuid)
RETURNS void LANGUAGE sql AS $$
  UPDATE live_sessions SET viewer_count = viewer_count + 1 WHERE id = p_session_id;
$$;

CREATE OR REPLACE FUNCTION decrement_viewer_count(p_session_id uuid)
RETURNS void LANGUAGE sql AS $$
  UPDATE live_sessions SET viewer_count = GREATEST(0, viewer_count - 1) WHERE id = p_session_id;
$$;

-- 5. Realtime for Live Comments
-- Explicitly add live_comments and live_sessions to the supabase_realtime publication (safely)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'live_comments'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE live_comments;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'live_sessions'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE live_sessions;
  END IF;
END $$;
