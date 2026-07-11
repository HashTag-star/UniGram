-- 018: Active user tracking + ban flag on profiles

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS last_seen timestamptz,
  ADD COLUMN IF NOT EXISTS is_banned boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_profiles_last_seen ON public.profiles(last_seen DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS idx_profiles_is_banned  ON public.profiles(is_banned) WHERE is_banned = true;

-- RLS: allow each user to update their own last_seen (IF NOT EXISTS not supported for POLICY)
DROP POLICY IF EXISTS "users can update own last_seen" ON public.profiles;
CREATE POLICY "users can update own last_seen"
  ON public.profiles
  FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);
