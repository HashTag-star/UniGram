-- Securely deletes the invoking user from auth.users
-- This cascades down to public.profiles and all associated data thanks to foreign keys.

CREATE OR REPLACE FUNCTION public.delete_current_user()
RETURNS void 
LANGUAGE plpgsql
SECURITY DEFINER -- Runs with elevated privileges to access auth.users
SET search_path = public
AS $$
BEGIN
  -- Ensure that only an authenticated user can execute this
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Delete from auth.users. 
  -- Foreign keys ON DELETE CASCADE will automatically clean up 
  -- profiles, posts, reels, follows, and likes.
  DELETE FROM auth.users WHERE id = auth.uid();
END;
$$;
