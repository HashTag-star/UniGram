-- ============================================================
-- 010_hybrid_algorithm.sql
-- Implements the UniGram Hybrid Algorithm: IG + X + Campus
-- Ref: Score = (E * 0.4) + (V * 0.25) + (R * 0.2) + (C * 0.15)
-- ============================================================

-- Track shares explicitly if not already in schema
CREATE TABLE IF NOT EXISTS public.post_shares (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id uuid REFERENCES public.posts(id) ON DELETE CASCADE,
  user_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Refined Hybrid Feed RPC
CREATE OR REPLACE FUNCTION get_hybrid_campus_feed(
  p_user_id uuid,
  p_limit   int DEFAULT 20,
  p_offset  int DEFAULT 0
)
RETURNS TABLE (
  id             uuid,
  user_id        uuid,
  type           text,
  media_url      text,
  caption        text,
  university_tag text,
  hashtags       text[],
  likes_count    int,
  comments_count int,
  reposts_count  int,
  saves_count    int,
  views_count    int,
  shares_count   int,
  created_at     timestamptz,
  location       text,
  song           text,
  tagged_users   text[],
  media_urls     text[],
  music_url      text,
  score          float,
  profiles       jsonb
) LANGUAGE plpgsql STABLE AS $$
DECLARE
  v_my_uni    text;
  v_my_major  text;
  v_following uuid[];
BEGIN
  -- 1. Context Acquisition
  SELECT p_pro.university, p_pro.major INTO v_my_uni, v_my_major
  FROM public.profiles p_pro WHERE p_pro.id = p_user_id;

  SELECT array_agg(f.following_id) INTO v_following
  FROM public.follows f WHERE f.follower_id = p_user_id;

  RETURN QUERY
  WITH raw_data AS (
    SELECT
      p.id, p.user_id, p.type, p.media_url, p.caption, p.university_tag,
      p.hashtags, p.likes_count, p.comments_count, p.reposts_count,
      p.saves_count, p.views_count, p.shares_count, p.created_at,
      p.location, p.song, p.tagged_users, p.media_urls, p.music_url,
      pr.university AS author_uni,
      pr.major AS author_major,
      row_to_json(pr.*)::jsonb AS profile_json,
      -- E: Engagement Points
      ((p.likes_count * 1) + (p.comments_count * 3) + (p.saves_count * 8) + (p.shares_count * 5))::float AS e_points,
      -- T: Time Decay (Hours)
      EXTRACT(EPOCH FROM (now() - p.created_at)) / 3600 AS hours_since
    FROM public.posts p
    JOIN public.profiles pr ON pr.id = p.user_id
    WHERE p.user_id != p_user_id
      AND pr.is_banned = false
      -- Impression Filter (already seen in 48h)
      AND NOT EXISTS (
        SELECT 1 FROM public.post_impressions pi
        WHERE pi.post_id = p.id AND pi.user_id = p_user_id
          AND pi.seen_at > now() - INTERVAL '48 hours'
      )
  ),
  scored_data AS (
    SELECT
      *,
      -- Velocity (V): Engagement speed
      (e_points / log(2 + hours_since))::float AS velocity,
      -- Relationship (R): Direct signals
      COALESCE((
        SELECT ur.strength * EXP(-0.005 * EXTRACT(EPOCH FROM (now() - ur.last_interact)) / 86400)
        FROM user_relationships ur
        WHERE ur.user_a = p_user_id AND ur.user_b = raw_data.user_id
      ), 0.0)::float AS rel_strength,
      -- Campus (C): Context factors
      (
        CASE WHEN author_uni = v_my_uni AND v_my_uni IS NOT NULL THEN 40.0 ELSE 0.0 END +
        CASE WHEN author_major = v_my_major AND v_my_major IS NOT NULL THEN 20.0 ELSE 0.0 END +
        CASE WHEN v_following IS NOT NULL AND raw_data.user_id = ANY(v_following) THEN 50.0 ELSE 0.0 END
      )::float AS campus_score
    FROM raw_data
  )
  SELECT
    sd.id, sd.user_id, sd.type, sd.media_url, sd.caption, sd.university_tag,
    sd.hashtags, sd.likes_count, sd.comments_count, sd.reposts_count,
    sd.saves_count, sd.views_count, sd.shares_count, sd.created_at,
    sd.location, sd.song, sd.tagged_users, sd.media_urls, sd.music_url,
    (
      (sd.e_points * 0.4) + 
      (sd.velocity * 0.25) + 
      (sd.rel_strength * 0.2) + 
      (sd.campus_score * 0.15)
    )::float AS final_score,
    sd.profile_json
  FROM scored_data sd
  ORDER BY final_score DESC
  LIMIT p_limit OFFSET p_offset;
END;
$$;

GRANT EXECUTE ON FUNCTION get_hybrid_campus_feed TO authenticated;
