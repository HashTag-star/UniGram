-- 020: Fix ambiguous "id" column in get_profiles_with_email
-- The RETURNS TABLE(id uuid, ...) declaration shadows column names inside the
-- function body, making unqualified "id" references ambiguous in subqueries.
-- Fix: alias every table reference inside the function.

CREATE OR REPLACE FUNCTION public.get_profiles_with_email(
  p_limit  int  DEFAULT 200,
  p_offset int  DEFAULT 0
)
RETURNS TABLE(
  id           uuid,
  username     text,
  full_name    text,
  email        text,
  university   text,
  is_verified  boolean,
  is_banned    boolean,
  is_admin     boolean,
  avatar_url   text,
  created_at   timestamptz,
  last_seen    timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
BEGIN
  -- Gate: caller must be an authenticated admin
  -- Use explicit alias to avoid shadowing by RETURNS TABLE column names
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM public.profiles AS _chk
    WHERE _chk.id = auth.uid()
      AND _chk.is_admin = true
  ) THEN
    RAISE EXCEPTION 'Admin privilege required';
  END IF;

  RETURN QUERY
  SELECT
    p.id,
    p.username,
    p.full_name,
    COALESCE(au.email::text, '') AS email,
    p.university,
    COALESCE(p.is_verified,  false) AS is_verified,
    COALESCE(p.is_banned,    false) AS is_banned,
    COALESCE(p.is_admin,     false) AS is_admin,
    p.avatar_url,
    p.created_at,
    p.last_seen
  FROM public.profiles p
  LEFT JOIN auth.users au ON au.id = p.id
  ORDER BY p.created_at DESC
  LIMIT p_limit OFFSET p_offset;
END;
$$;

-- Preserve existing grants
REVOKE ALL ON FUNCTION public.get_profiles_with_email(int, int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_profiles_with_email(int, int) TO authenticated;
