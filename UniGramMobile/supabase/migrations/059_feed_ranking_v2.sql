-- ============================================================
-- 059_feed_ranking_v2.sql
-- Feed ranking v2 + richer behaviour learning.
--
-- Fixes in the previous get_hybrid_campus_feed (028):
--  * Posts the viewer had already seen in 48h were EXCLUDED, while the client
--    paged with OFFSET. Every impression shrank the candidate pool, so page 2
--    silently skipped posts and a full pull-to-refresh could return nothing.
--    -> seen posts are now penalised (sorted last), never removed, and the
--       client pages with an explicit exclude list instead of OFFSET.
--  * Raw engagement counts (weight 0.4) dominated and nothing aged out, so old
--    viral posts sat at the top forever. -> log-scaled engagement + freshness.
--  * user_preferences was never read by the ranker. -> tag/type/category
--    affinities now feed the score.
--  * Blocked users and "not interested" items were only filtered client-side.
--  * Adds a small per-session jitter so a refresh is not byte-identical.
-- ============================================================

-- 1. Behaviour-learning storage ---------------------------------------------
ALTER TABLE public.user_preferences
  ADD COLUMN IF NOT EXISTS tag_affinities  jsonb NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS type_affinities jsonb NOT NULL DEFAULT '{}';

-- 'skip' = a post that was scrolled past in well under a second (soft negative)
ALTER TABLE public.interactions DROP CONSTRAINT IF EXISTS interactions_type_check;
ALTER TABLE public.interactions
  ADD CONSTRAINT interactions_type_check
  CHECK (type IN ('like','comment','save','share','dwell','skip'));

-- 2. Ranker -----------------------------------------------------------------
DROP FUNCTION IF EXISTS get_hybrid_campus_feed(uuid, integer, integer);
DROP FUNCTION IF EXISTS get_hybrid_campus_feed(uuid, integer, integer, uuid[], integer);

CREATE OR REPLACE FUNCTION get_hybrid_campus_feed(
  p_user_id     uuid,
  p_limit       int    DEFAULT 20,
  p_offset      int    DEFAULT 0,
  p_exclude_ids uuid[] DEFAULT '{}',
  p_seed        int    DEFAULT 0
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
  profiles       jsonb,
  quote_of       uuid,
  repost_of      uuid
) LANGUAGE plpgsql STABLE AS $$
DECLARE
  v_my_uni      text;
  v_my_major    text;
  v_following   uuid[];
  v_blocked     uuid[] := '{}';
  v_hide_posts  uuid[] := '{}';
  v_hide_auth   uuid[] := '{}';
  v_tag_aff     jsonb  := '{}';
  v_type_aff    jsonb  := '{}';
  v_exclude     uuid[];
BEGIN
  v_exclude := COALESCE(p_exclude_ids, '{}');

  SELECT p_pro.university, p_pro.major INTO v_my_uni, v_my_major
  FROM public.profiles p_pro WHERE p_pro.id = p_user_id;

  SELECT COALESCE(array_agg(f.following_id), '{}') INTO v_following
  FROM public.follows f WHERE f.follower_id = p_user_id;

  -- Learned taste (table/columns may not exist on a half-migrated database)
  BEGIN
    SELECT COALESCE(up.tag_affinities, '{}'), COALESCE(up.type_affinities, '{}')
      INTO v_tag_aff, v_type_aff
    FROM public.user_preferences up WHERE up.user_id = p_user_id;
    v_tag_aff  := COALESCE(v_tag_aff,  '{}');
    v_type_aff := COALESCE(v_type_aff, '{}');
  EXCEPTION WHEN OTHERS THEN
    v_tag_aff := '{}'; v_type_aff := '{}';
  END;

  -- Blocks, in both directions
  BEGIN
    SELECT COALESCE(array_agg(b.uid), '{}') INTO v_blocked FROM (
      SELECT bu.blocked_id AS uid FROM public.blocked_users bu WHERE bu.blocker_id = p_user_id
      UNION
      SELECT bu.blocker_id AS uid FROM public.blocked_users bu WHERE bu.blocked_id = p_user_id
    ) b;
  EXCEPTION WHEN OTHERS THEN
    v_blocked := '{}';
  END;

  -- "Not interested": the post is hidden, the author is down-ranked
  BEGIN
    SELECT COALESCE(array_agg(uf.target_id) FILTER (WHERE uf.target_type = 'post'), '{}'),
           COALESCE(array_agg(DISTINCT uf.author_id) FILTER (WHERE uf.author_id IS NOT NULL), '{}')
      INTO v_hide_posts, v_hide_auth
    FROM public.user_feedback uf
    WHERE uf.user_id = p_user_id AND uf.feedback_type = 'not_interested';
  EXCEPTION WHEN OTHERS THEN
    v_hide_posts := '{}'; v_hide_auth := '{}';
  END;

  RETURN QUERY
  WITH candidates AS (
    SELECT
      p.id AS c_id, p.user_id AS c_user_id, p.type AS c_type, p.media_url AS c_media_url,
      p.caption AS c_caption, p.university_tag AS c_university_tag, p.hashtags AS c_hashtags,
      p.likes_count AS c_likes, p.comments_count AS c_comments, p.reposts_count AS c_reposts,
      p.saves_count AS c_saves, p.views_count AS c_views, p.shares_count AS c_shares,
      p.created_at AS c_created_at, p.location AS c_location, p.song AS c_song,
      p.tagged_users AS c_tagged, p.media_urls AS c_media_urls, p.music_url AS c_music_url,
      p.quote_of AS c_quote_of, p.repost_of AS c_repost_of,
      pr.university AS author_uni, pr.major AS author_major,
      row_to_json(pr.*)::jsonb AS profile_json,
      EXTRACT(EPOCH FROM (now() - p.created_at)) / 3600.0 AS hours_since
    FROM public.posts p
    JOIN public.profiles pr ON pr.id = p.user_id
    WHERE p.user_id <> p_user_id
      AND COALESCE(pr.is_banned, false) = false
      AND p.created_at > now() - INTERVAL '21 days'
      AND NOT (p.id = ANY(v_exclude))
      AND NOT (p.user_id = ANY(v_blocked))
      AND NOT (p.id = ANY(v_hide_posts))
    ORDER BY p.created_at DESC
    LIMIT 800
  ),
  scored AS (
    SELECT
      c.*,
      -- engagement points, log-scaled so one viral post can't bury everything
      (COALESCE(c.c_likes,0) + 3*COALESCE(c.c_comments,0) + 4*COALESCE(c.c_saves,0)
        + 5*COALESCE(c.c_shares,0) + 2*COALESCE(c.c_reposts,0))::float AS e_points,
      -- relationship strength with natural decay
      COALESCE((
        SELECT ur.strength * EXP(-0.02 * EXTRACT(EPOCH FROM (now() - ur.last_interact)) / 86400.0)
        FROM public.user_relationships ur
        WHERE ur.user_a = p_user_id AND ur.user_b = c.c_user_id
      ), 0.0)::float AS rel_strength,
      -- hashtags: stored column first, caption as fallback
      COALESCE(
        (SELECT array_agg(lower(ltrim(h, '#'))) FROM unnest(c.c_hashtags) h),
        (SELECT array_agg(lower(m[1])) FROM regexp_matches(COALESCE(c.c_caption, ''), '#(\w+)', 'g') m)
      ) AS tags,
      (c.c_user_id = ANY(v_following)) AS is_following,
      EXISTS (
        SELECT 1 FROM public.post_impressions pi
        WHERE pi.post_id = c.c_id AND pi.user_id = p_user_id
          AND pi.seen_at > now() - INTERVAL '48 hours'
      ) AS seen
    FROM candidates c
  ),
  ranked AS (
    SELECT
      s.*,
      (
        0.24 * EXP(-s.hours_since / 48.0)                                      -- freshness
      + 0.13 * LEAST(1.0, LN(1 + s.e_points) / 6.0)                            -- overall quality
      + 0.12 * LEAST(1.0, LN(1 + s.e_points / (s.hours_since + 2.0)) / 3.0)    -- velocity
      + 0.15 * LEAST(1.0, s.rel_strength / 20.0)                               -- relationship
      + 0.13 * (CASE WHEN s.is_following THEN 1.0 ELSE 0.0 END)                -- follows
      + 0.07 * LEAST(1.0,
            (CASE WHEN s.author_uni   IS NOT NULL AND s.author_uni   = v_my_uni   THEN 0.7 ELSE 0 END)
          + (CASE WHEN s.author_major IS NOT NULL AND s.author_major = v_my_major THEN 0.3 ELSE 0 END)) -- campus
      + 0.12 * LEAST(1.0, COALESCE((
            SELECT SUM(GREATEST(COALESCE((v_tag_aff ->> t)::float, 0), 0))
            FROM unnest(COALESCE(s.tags, '{}')) t), 0) / 8.0)                  -- topic affinity
      + 0.04 * LEAST(1.0, GREATEST(COALESCE((v_type_aff ->> s.c_type)::float, 0), 0) / 20.0) -- format affinity
      )
      * (CASE WHEN s.seen THEN 0.06 ELSE 1.0 END)                              -- already seen -> last
      * (CASE WHEN s.c_user_id = ANY(v_hide_auth) THEN 0.25 ELSE 1.0 END)      -- "not interested" author
      + ((abs(hashtext(s.c_id::text || p_seed::text)) % 1000) / 1000.0) * 0.06 -- exploration jitter
      AS final_score
    FROM scored s
  )
  SELECT
    r.c_id, r.c_user_id, r.c_type, r.c_media_url, r.c_caption, r.c_university_tag,
    r.c_hashtags, r.c_likes, r.c_comments, r.c_reposts, r.c_saves, r.c_views, r.c_shares,
    r.c_created_at, r.c_location, r.c_song, r.c_tagged, r.c_media_urls, r.c_music_url,
    r.final_score::float, r.profile_json, r.c_quote_of, r.c_repost_of
  FROM ranked r
  ORDER BY r.final_score DESC, r.c_created_at DESC
  LIMIT p_limit OFFSET p_offset;
END;
$$;

GRANT EXECUTE ON FUNCTION get_hybrid_campus_feed(uuid, int, int, uuid[], int) TO authenticated;
