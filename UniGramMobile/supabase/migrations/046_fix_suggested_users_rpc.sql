-- ============================================================
-- 042_fix_suggested_users_rpc.sql
-- Fixes column reference "university" is ambiguous error by
-- redefining get_suggested_users using pure SQL.
-- ============================================================

DROP FUNCTION IF EXISTS public.get_suggested_users(uuid, int);

CREATE OR REPLACE FUNCTION public.get_suggested_users(p_user_id uuid, p_limit int DEFAULT 20)
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
) LANGUAGE sql STABLE AS $$
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
    CASE WHEN pr.university = (SELECT p.university FROM public.profiles p WHERE p.id = p_user_id) AND (SELECT p.university FROM public.profiles p WHERE p.id = p_user_id) IS NOT NULL THEN 1 ELSE 0 END DESC,
    pr.followers_count DESC
  LIMIT p_limit;
$$;

GRANT EXECUTE ON FUNCTION public.get_suggested_users TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_suggested_users TO anon;
