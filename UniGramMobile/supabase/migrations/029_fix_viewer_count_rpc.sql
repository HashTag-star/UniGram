-- ============================================================
-- 029_fix_viewer_count_rpc.sql
-- Viewer count RPCs must bypass RLS because the caller is a
-- viewer (not the session creator), so the existing UPDATE policy
-- would block the increment/decrement silently.
-- SECURITY DEFINER runs as the function owner (postgres) and
-- bypasses RLS — the correct Supabase pattern for counter RPCs.
-- ============================================================

CREATE OR REPLACE FUNCTION increment_viewer_count(p_session_id uuid)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE live_sessions
  SET viewer_count = viewer_count + 1
  WHERE id = p_session_id AND status = 'live';
$$;

CREATE OR REPLACE FUNCTION decrement_viewer_count(p_session_id uuid)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE live_sessions
  SET viewer_count = GREATEST(0, viewer_count - 1)
  WHERE id = p_session_id;
$$;
