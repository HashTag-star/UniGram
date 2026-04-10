-- ============================================================
-- 003_advanced_algorithm.sql
-- Adds pgvector, vector columns, and advanced recommendation RPCs
-- ============================================================

-- 1. Enable pgvector
CREATE EXTENSION IF NOT EXISTS vector WITH SCHEMA extensions;

-- 2. Add embeddings column to posts
ALTER TABLE public.posts ADD COLUMN IF NOT EXISTS embedding extensions.vector(384);

-- 3. Create index for fast nearest-neighbor searches
CREATE INDEX IF NOT EXISTS posts_embedding_idx ON public.posts USING hnsw (embedding vector_ip_ops);

-- 4. Social Graph Recommendation (Mutuals & Friends of Friends)
CREATE OR REPLACE FUNCTION get_suggested_users(p_user_id uuid, p_limit int DEFAULT 20)
RETURNS TABLE (
  id uuid,
  username text,
  full_name text,
  avatar_url text,
  is_verified boolean,
  verification_type text,
  university text,
  followers_count int,
  mutual_friends int, 
  follows_me boolean
) LANGUAGE plpgsql STABLE AS $$
DECLARE
  v_my_uni text;
BEGIN
  SELECT university INTO v_my_uni FROM public.profiles WHERE id = p_user_id;

  RETURN QUERY
  WITH my_follows AS (
    SELECT following_id FROM public.follows WHERE follower_id = p_user_id
  ),
  fof AS (
    SELECT f.following_id AS suggested_id, COUNT(*) as mutual_count
    FROM public.follows f
    JOIN my_follows mf ON f.follower_id = mf.following_id
    WHERE f.following_id != p_user_id
      AND f.following_id NOT IN (SELECT following_id FROM my_follows)
    GROUP BY f.following_id
  )
  SELECT 
    pr.id, pr.username, pr.full_name, pr.avatar_url, 
    pr.is_verified, pr.verification_type, pr.university, pr.followers_count,
    COALESCE(fof.mutual_count, 0)::int AS mutual_friends,
    EXISTS(SELECT 1 FROM public.follows WHERE follower_id = pr.id AND following_id = p_user_id) AS follows_me
  FROM public.profiles pr
  LEFT JOIN fof ON fof.suggested_id = pr.id
  WHERE pr.id != p_user_id
    AND pr.id NOT IN (SELECT following_id FROM my_follows)
    AND pr.is_banned = false
  ORDER BY 
    COALESCE(fof.mutual_count, 0) DESC,
    CASE WHEN pr.university = v_my_uni AND v_my_uni IS NOT NULL THEN 1 ELSE 0 END DESC,
    pr.followers_count DESC
  LIMIT p_limit;
END;
$$;

-- 5. AI Vector-based Explore Feed Recommendation
CREATE OR REPLACE FUNCTION get_vector_explore_posts(
  p_embedding extensions.vector(384),
  p_user_id uuid,
  p_match_threshold float DEFAULT 0.5,
  p_limit int DEFAULT 24
)
RETURNS TABLE (
  id uuid,
  user_id uuid,
  type text,
  media_url text,
  caption text,
  hashtags text[],
  likes_count int,
  comments_count int,
  saves_count int,
  created_at timestamptz,
  location text,
  profiles jsonb,
  similarity float
) LANGUAGE plpgsql STABLE AS $$
BEGIN
  RETURN QUERY
  SELECT 
    p.id, p.user_id, p.type, p.media_url, p.caption, p.hashtags,
    p.likes_count, p.comments_count, p.saves_count, p.created_at,
    p.location, row_to_json(pr.*)::jsonb AS profiles,
    1 - (p.embedding <=> p_embedding) AS similarity
  FROM public.posts p
  JOIN public.profiles pr ON pr.id = p.user_id
  WHERE p.user_id != p_user_id
    AND pr.is_banned = false
    AND p.media_url IS NOT NULL
    AND p.embedding IS NOT NULL
    AND 1 - (p.embedding <=> p_embedding) > p_match_threshold
  ORDER BY p.embedding <=> p_embedding ASC
  LIMIT p_limit;
END;
$$;

GRANT EXECUTE ON FUNCTION get_suggested_users TO authenticated;
GRANT EXECUTE ON FUNCTION get_vector_explore_posts TO authenticated;
