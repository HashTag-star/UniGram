-- 019: Admin role flag + secure email RPC for admin dashboard

-- Add is_admin flag to profiles (safe to run multiple times)
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS is_admin boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_profiles_is_admin ON public.profiles(is_admin) WHERE is_admin = true;

-- RLS: only allow admins to see the is_admin column value of others
-- (profiles SELECT policy already exists; this just adds the admin column)

-- ─── Secure email RPC ───────────────────────────────────────────────────────
-- Fetches profiles joined with real auth.users emails.
-- SECURITY DEFINER runs as the migration owner who can read auth.users.
-- The caller must be an admin or the function raises an exception.
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
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = true) THEN
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

-- Grant execute only to authenticated users (RLS check inside ensures admin-only)
REVOKE ALL ON FUNCTION public.get_profiles_with_email(int, int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_profiles_with_email(int, int) TO authenticated;

-- ─── Helper: promote a user to admin by email ───────────────────────────────
-- Run once manually: SELECT promote_to_admin('you@university.edu');
CREATE OR REPLACE FUNCTION public.promote_to_admin(p_email text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_user_id uuid;
BEGIN
  SELECT id INTO v_user_id FROM auth.users WHERE email = p_email LIMIT 1;
  IF v_user_id IS NULL THEN
    RETURN 'User not found: ' || p_email;
  END IF;
  UPDATE public.profiles SET is_admin = true WHERE id = v_user_id;
  RETURN 'Promoted to admin: ' || p_email;
END;
$$;

-- Restrict: only service_role can call promote_to_admin
REVOKE ALL ON FUNCTION public.promote_to_admin(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.promote_to_admin(text) TO service_role;
