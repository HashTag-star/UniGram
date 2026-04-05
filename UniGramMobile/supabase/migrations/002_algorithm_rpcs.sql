-- ============================================================
-- UniGram Algorithm RPCs  —  applied 2026-04-05
-- All functions here are live in Supabase project rcvzcbfmstgwzrolnhvy
-- ============================================================

-- ── Supporting tables ─────────────────────────────────────────────────────────
-- user_relationships (user_a, user_b, strength, last_interact) — pre-existing
-- post_impressions   (post_id, user_id, seen_at)               — pre-existing
-- user_interests     (user_id, interest)                        — pre-existing

-- Dismissed follow suggestions
CREATE TABLE IF NOT EXISTS dismissed_suggestions (
  user_id   uuid REFERENCES profiles(id) ON DELETE CASCADE,
  target_id uuid REFERENCES profiles(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, target_id)
);
ALTER TABLE dismissed_suggestions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users manage own dismissals"
  ON dismissed_suggestions FOR ALL
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- ── Trigger: save = 8pts (strongest engagement signal) ───────────────────────
CREATE OR REPLACE FUNCTION on_post_save_algorithm()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE v_author_id uuid;
BEGIN
  SELECT user_id INTO v_author_id FROM posts WHERE id = NEW.post_id;
  IF v_author_id IS NOT NULL AND v_author_id != NEW.user_id THEN
    PERFORM update_rel_strength(NEW.user_id, v_author_id, 8.0);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_algo_post_save ON post_saves;
CREATE TRIGGER trg_algo_post_save
  AFTER INSERT ON post_saves
  FOR EACH ROW EXECUTE FUNCTION on_post_save_algorithm();

-- ── Trigger summary (all automatic, no client calls needed) ──────────────────
-- trg_algo_post_like    → on_post_like_algorithm    → +2.0 pts
-- trg_algo_post_comment → on_post_comment_algorithm → +5.0 pts
-- trg_algo_post_save    → on_post_save_algorithm    → +8.0 pts  (added above)
-- trg_algo_follow       → on_follow_algorithm       → +15.0 pts
-- trg_algo_message      → on_message_algorithm      → (dm signal)
--
-- Client-side only (no DB table to trigger from):
--   recordShare()       → update_rel_strength       → +6.0 pts
--   recordVideoWatch()  → update_rel_strength       → proportional to % watched
--   recordProfileView() → update_rel_strength       → +1.0 pts

-- ── increment_post_shares ─────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION increment_post_shares(p_post_id uuid)
RETURNS void LANGUAGE sql AS $$
  UPDATE posts SET shares_count = shares_count + 1 WHERE id = p_post_id;
$$;

-- ── get_personalized_feed (fixed: removed self-boost bug, excluded own posts) ─
CREATE OR REPLACE FUNCTION get_personalized_feed(
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
  v_interests text[];
  v_following uuid[];
  v_my_uni    text;
  v_my_major  text;
BEGIN
  SELECT array_agg(ui.interest) INTO v_interests
  FROM public.user_interests ui WHERE ui.user_id = p_user_id;

  SELECT array_agg(f.following_id) INTO v_following
  FROM public.follows f WHERE f.follower_id = p_user_id;

  SELECT university, major INTO v_my_uni, v_my_major
  FROM public.profiles WHERE id = p_user_id;

  RETURN QUERY
  SELECT
    p.id, p.user_id, p.type, p.media_url, p.caption, p.university_tag,
    p.hashtags, p.likes_count, p.comments_count, p.reposts_count,
    p.saves_count, p.views_count, p.shares_count, p.created_at,
    p.location, p.song, p.tagged_users, p.media_urls, p.music_url,
    (
      CASE WHEN v_following IS NOT NULL AND p.user_id = ANY(v_following) THEN 60.0 ELSE 0.0 END
      + COALESCE((
          SELECT ur.strength * EXP(-0.005 * EXTRACT(EPOCH FROM (now() - ur.last_interact)) / 86400)
          FROM user_relationships ur
          WHERE ur.user_a = p_user_id AND ur.user_b = p.user_id
        ), 0.0)
      + CASE WHEN pr.university = v_my_uni AND v_my_uni IS NOT NULL THEN 40.0 ELSE 0.0 END
      + CASE WHEN pr.major = v_my_major AND v_my_major IS NOT NULL THEN 20.0 ELSE 0.0 END
      + COALESCE((
          SELECT COUNT(*) * 30.0
          FROM unnest(p.hashtags) h
          WHERE v_interests IS NOT NULL
            AND (lower(h) = ANY(SELECT lower(i) FROM unnest(v_interests) i)
              OR lower(h) = ANY(SELECT '#' || lower(i) FROM unnest(v_interests) i))
        ), 0.0)
      + (p.likes_count * 0.5)
      + (p.comments_count * 2.0)
      + (p.saves_count * 3.0)
      + (POW(0.98, LEAST(EXTRACT(EPOCH FROM (now() - p.created_at)) / 3600, 100)) * 50.0)
      - CASE WHEN EXISTS (
          SELECT 1 FROM public.post_impressions pi2
          WHERE pi2.post_id = p.id AND pi2.user_id = p_user_id
            AND pi2.seen_at > now() - INTERVAL '48 hours'
        ) THEN 40.0 ELSE 0.0 END
      + (random() * 5.0)
    )::float AS score,
    row_to_json(pr.*)::jsonb AS profiles
  FROM public.posts p
  JOIN public.profiles pr ON pr.id = p.user_id
  WHERE p.user_id != p_user_id
    AND pr.is_banned = false
  ORDER BY score DESC, p.created_at DESC
  LIMIT p_limit OFFSET p_offset;
END;
$$;

-- ── get_explore_posts ─────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION get_explore_posts(
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

  SELECT university INTO v_my_uni
  FROM public.profiles WHERE id = p_user_id;

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

-- ── Grants ────────────────────────────────────────────────────────────────────
GRANT EXECUTE ON FUNCTION get_personalized_feed   TO authenticated;
GRANT EXECUTE ON FUNCTION get_explore_posts        TO authenticated;
GRANT EXECUTE ON FUNCTION get_suggested_users      TO authenticated;
GRANT EXECUTE ON FUNCTION get_trending_hashtags    TO authenticated;
GRANT EXECUTE ON FUNCTION update_rel_strength      TO authenticated;
GRANT EXECUTE ON FUNCTION increment_post_shares    TO authenticated;
