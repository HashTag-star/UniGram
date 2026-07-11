-- Pro subscription fields on profiles
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS is_pro boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS pro_expires_at timestamptz;

-- Story link URL (enforced in-app for Pro users only)
ALTER TABLE stories
  ADD COLUMN IF NOT EXISTS link_url text;

-- Profile views table for Pro analytics
CREATE TABLE IF NOT EXISTS profile_views (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id  uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  viewer_id   uuid REFERENCES profiles(id) ON DELETE SET NULL,
  viewed_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS profile_views_profile_idx ON profile_views(profile_id, viewed_at DESC);

ALTER TABLE profile_views ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "owner_reads_own_profile_views" ON profile_views;
CREATE POLICY "owner_reads_own_profile_views" ON profile_views
  FOR SELECT USING (profile_id = auth.uid());

DROP POLICY IF EXISTS "authenticated_can_record_view" ON profile_views;
CREATE POLICY "authenticated_can_record_view" ON profile_views
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

-- ── RPCs ────────────────────────────────────────────────────────────────────────

-- Per-post analytics for a Pro user (last N days)
CREATE OR REPLACE FUNCTION get_post_analytics(p_user_id uuid, p_days integer DEFAULT 30)
RETURNS TABLE(
  post_id        uuid,
  caption        text,
  media_url      text,
  created_at     timestamptz,
  likes_count    integer,
  comments_count integer,
  reposts_count  integer,
  views          bigint,
  reach          bigint
)
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT
    p.id,
    p.caption,
    p.media_url,
    p.created_at,
    p.likes_count,
    p.comments_count,
    p.reposts_count,
    COUNT(pi.post_id)           AS views,
    COUNT(DISTINCT pi.user_id)  AS reach
  FROM posts p
  LEFT JOIN post_impressions pi ON pi.post_id = p.id
  WHERE p.user_id = p_user_id
    AND p.created_at > now() - (p_days || ' days')::interval
  GROUP BY p.id
  ORDER BY p.created_at DESC
  LIMIT 50;
$$;

-- Account-level analytics summary
CREATE OR REPLACE FUNCTION get_profile_analytics(p_user_id uuid)
RETURNS jsonb
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT jsonb_build_object(
    'followers',         (SELECT COUNT(*) FROM follows WHERE following_id = p_user_id),
    'following',         (SELECT COUNT(*) FROM follows WHERE follower_id  = p_user_id),
    'profile_views_7d',  (SELECT COUNT(*) FROM profile_views WHERE profile_id = p_user_id AND viewed_at > now() - interval '7 days'),
    'profile_views_30d', (SELECT COUNT(*) FROM profile_views WHERE profile_id = p_user_id AND viewed_at > now() - interval '30 days'),
    'total_posts',       (SELECT COUNT(*) FROM posts WHERE user_id = p_user_id),
    'total_likes',       (SELECT COALESCE(SUM(likes_count), 0) FROM posts WHERE user_id = p_user_id),
    'total_views_30d',   (
      SELECT COUNT(*) FROM post_impressions pi
      JOIN posts p ON p.id = pi.post_id
      WHERE p.user_id = p_user_id
        AND pi.seen_at > now() - interval '30 days'
    )
  );
$$;

-- Record a profile view for Pro analytics (separate from the rel_strength system)
CREATE OR REPLACE FUNCTION record_profile_view_analytics(p_profile_id uuid, p_viewer_id uuid)
RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  INSERT INTO profile_views(profile_id, viewer_id)
  VALUES (p_profile_id, p_viewer_id);
$$;
