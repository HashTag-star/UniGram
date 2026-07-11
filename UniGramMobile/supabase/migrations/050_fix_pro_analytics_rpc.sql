-- 050_fix_pro_analytics_rpc.sql
-- 1. Upgrade get_profile_analytics function to include all audience, views, and engagement fields
-- 2. Upgrade get_explore_posts function to include the Pro priority score boost (+15 points)

-- ── 1. Upgrade get_profile_analytics ──────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_profile_analytics(p_user_id uuid)
RETURNS jsonb
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT jsonb_build_object(
    -- Audience
    'followers',              (SELECT COUNT(*) FROM follows WHERE following_id = p_user_id),
    'following',              (SELECT COUNT(*) FROM follows WHERE follower_id  = p_user_id),

    -- Profile views — current + previous periods for trend
    'profile_views_7d',       (SELECT COUNT(*) FROM profile_views WHERE profile_id = p_user_id AND viewed_at > now() - interval '7 days'),
    'profile_views_30d',      (SELECT COUNT(*) FROM profile_views WHERE profile_id = p_user_id AND viewed_at > now() - interval '30 days'),
    'profile_views_prev_7d',  (SELECT COUNT(*) FROM profile_views WHERE profile_id = p_user_id AND viewed_at BETWEEN now() - interval '14 days' AND now() - interval '7 days'),
    'profile_views_prev_30d', (SELECT COUNT(*) FROM profile_views WHERE profile_id = p_user_id AND viewed_at BETWEEN now() - interval '60 days' AND now() - interval '30 days'),

    -- Post counts
    'total_posts',            (SELECT COUNT(*) FROM posts WHERE user_id = p_user_id),
    'total_likes',            (SELECT COALESCE(SUM(likes_count), 0)    FROM posts WHERE user_id = p_user_id),
    'total_comments',         (SELECT COALESCE(SUM(comments_count), 0) FROM posts WHERE user_id = p_user_id),

    -- 30-day engagement (on posts created in window)
    'likes_30d',              (SELECT COALESCE(SUM(likes_count), 0)    FROM posts WHERE user_id = p_user_id AND created_at > now() - interval '30 days'),
    'comments_30d',           (SELECT COALESCE(SUM(comments_count), 0) FROM posts WHERE user_id = p_user_id AND created_at > now() - interval '30 days'),

    -- Post impressions — current + previous 30d for trend
    'total_views_30d',        (
      SELECT COUNT(*) FROM post_impressions pi
      JOIN posts p ON p.id = pi.post_id
      WHERE p.user_id = p_user_id AND pi.seen_at > now() - interval '30 days'
    ),
    'total_views_prev_30d',   (
      SELECT COUNT(*) FROM post_impressions pi
      JOIN posts p ON p.id = pi.post_id
      WHERE p.user_id = p_user_id AND pi.seen_at BETWEEN now() - interval '60 days' AND now() - interval '30 days'
    )
  );
$$;

-- ── 2. Upgrade get_explore_posts ──────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_explore_posts(
  p_user_id uuid,
  p_limit   int DEFAULT 24,
  p_offset  int DEFAULT 0
)
RETURNS TABLE (
  id             uuid,
  user_id        uuid,
  type           text,
  media_url      text,
  caption        text,
  hashtags       text[],
  likes_count    int,
  comments_count int,
  saves_count    int,
  created_at     timestamptz,
  location       text,
  profiles       jsonb
) LANGUAGE plpgsql STABLE AS $$
DECLARE
  v_interests text[];
  v_my_uni    text;
BEGIN
  SELECT array_agg(ui.interest) INTO v_interests
  FROM public.user_interests ui WHERE ui.user_id = p_user_id;

  SELECT p_pro.university INTO v_my_uni
  FROM public.profiles p_pro WHERE p_pro.id = p_user_id;

  RETURN QUERY
  SELECT
    p.id, p.user_id, p.type, p.media_url, p.caption, p.hashtags,
    p.likes_count, p.comments_count, p.saves_count, p.created_at,
    p.location, row_to_json(pr.*)::jsonb AS profiles
  FROM public.posts p
  JOIN public.profiles pr ON pr.id = p.user_id
  WHERE p.user_id != p_user_id
    AND p.media_url IS NOT NULL
    AND pr.is_banned = false
  ORDER BY (
    COALESCE((
      SELECT COUNT(*) * 50.0
      FROM unnest(p.hashtags) h
      WHERE v_interests IS NOT NULL
        AND (lower(h) = ANY(SELECT lower(i) FROM unnest(v_interests) i)
          OR lower(h) = ANY(SELECT '#' || lower(i) FROM unnest(v_interests) i))
    ), 0.0)
    + CASE WHEN pr.university = v_my_uni AND v_my_uni IS NOT NULL THEN 25.0 ELSE 0.0 END
    + (p.likes_count    * 0.3)
    + (p.comments_count * 1.5)
    + (p.saves_count    * 4.0)
    + CASE WHEN pr.is_pro AND pr.pro_disabled = false AND (pr.pro_expires_at IS NULL OR pr.pro_expires_at > now()) THEN 15.0 ELSE 0.0 END
    + CASE WHEN p.created_at > now() - INTERVAL '24 hours' THEN 80.0 ELSE 0.0 END
    + CASE WHEN p.created_at > now() - INTERVAL '7 days'   THEN 20.0 ELSE 0.0 END
    - CASE WHEN EXISTS (
        SELECT 1 FROM public.post_impressions pi2
        WHERE pi2.post_id = p.id AND pi2.user_id = p_user_id
      ) THEN 30.0 ELSE 0.0 END
    + (random() * 8.0)
  ) DESC
  LIMIT p_limit OFFSET p_offset;
END;
$$;
