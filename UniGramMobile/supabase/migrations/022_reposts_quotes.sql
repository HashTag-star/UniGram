-- 022: Reposts and Quote Posts
-- Tracks who reposted what (like post_likes) and links posts to their originals.

-- ── Repost tracking table ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.post_reposts (
  post_id    uuid NOT NULL REFERENCES public.posts(id) ON DELETE CASCADE,
  user_id    uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (post_id, user_id)
);

ALTER TABLE public.post_reposts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "post_reposts: read"
  ON public.post_reposts FOR SELECT TO authenticated USING (true);

CREATE POLICY "post_reposts: own write"
  ON public.post_reposts FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- ── Foreign keys on posts ─────────────────────────────────────────────────────
ALTER TABLE public.posts
  ADD COLUMN IF NOT EXISTS repost_of uuid REFERENCES public.posts(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS quote_of  uuid REFERENCES public.posts(id) ON DELETE SET NULL;

-- reposts_count may already exist from earlier migrations — safe ADD IF NOT EXISTS
ALTER TABLE public.posts
  ADD COLUMN IF NOT EXISTS reposts_count integer NOT NULL DEFAULT 0;

-- ── RPC to safely increment / decrement reposts_count ────────────────────────
CREATE OR REPLACE FUNCTION public.increment_post_reposts(p_post_id uuid, delta integer)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.posts
  SET reposts_count = GREATEST(0, COALESCE(reposts_count, 0) + delta)
  WHERE id = p_post_id;
$$;

-- ── Notification type support ─────────────────────────────────────────────────
-- Allow 'repost' and 'quote' as notification types (add to check constraint if one exists)
DO $$
BEGIN
  -- Attempt to drop any existing type check; ignore if it doesn't exist
  ALTER TABLE public.notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;
