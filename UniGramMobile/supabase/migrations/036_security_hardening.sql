-- 036: Security hardening
-- 1. Fix delete_message_for_me: remove caller-controlled p_user_id, derive user from auth.uid()
-- 2. Protect privileged profile columns from self-modification by regular users

-- ── 1. delete_message_for_me ─────────────────────────────────────────────────
-- Old signature accepted p_user_id from the caller, allowing any authenticated user
-- to pass a victim's UUID and delete messages from their view (SECURITY DEFINER
-- bypasses RLS). New signature takes only p_message_id and derives the acting user
-- from auth.uid() inside the function body.

CREATE OR REPLACE FUNCTION delete_message_for_me(p_message_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  UPDATE public.messages
  SET deleted_by = array_append(deleted_by, auth.uid())
  WHERE id = p_message_id
    AND NOT (deleted_by @> ARRAY[auth.uid()]);
END;
$$;

-- ── 2. Protect privileged profile columns ────────────────────────────────────
-- The profiles UPDATE RLS policy (USING auth.uid() = id) correctly restricts
-- which ROW a user can update, but does not restrict which COLUMNS. Without
-- column-level protection, any authenticated user can set is_admin=true,
-- is_banned=false, is_pro=true, etc. on their own profile row.
-- This trigger fires BEFORE UPDATE and raises an error if a non-service-role
-- session attempts to change any privileged column.

CREATE OR REPLACE FUNCTION profiles_guard_privileged_cols()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- current_setting throws if the GUC doesn't exist; default to empty string
  IF (
    (NEW.is_admin     IS DISTINCT FROM OLD.is_admin)     OR
    (NEW.is_banned    IS DISTINCT FROM OLD.is_banned)    OR
    -- is_suspended column does not exist in schema; removed to prevent runtime error
    -- [Kofi Asante - Backend] fix: removed reference to non-existent is_suspended column
    (NEW.is_verified  IS DISTINCT FROM OLD.is_verified)  OR
    (NEW.is_pro       IS DISTINCT FROM OLD.is_pro)
  ) THEN
    -- Allow writes only from service_role (bypasses RLS/triggers when using
    -- the service-role key — postgres role is 'postgres' or 'service_role')
    IF current_user NOT IN ('postgres', 'service_role') THEN
      RAISE EXCEPTION 'Cannot modify privileged profile fields';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS profiles_privileged_guard ON public.profiles;
CREATE TRIGGER profiles_privileged_guard
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION profiles_guard_privileged_cols();
