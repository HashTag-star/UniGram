-- 052_campus_ad_engagement.sql
-- Add support for liking, commenting, and full organic interaction on campus ads, matching top social media platforms.

-- ── 1. Add counters to campus_ads ───────────────────────────────────────────
ALTER TABLE public.campus_ads
  ADD COLUMN IF NOT EXISTS likes_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS comments_count integer NOT NULL DEFAULT 0;

-- ── 2. Create campus_ad_likes ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.campus_ad_likes (
  ad_id       uuid NOT NULL REFERENCES public.campus_ads(id) ON DELETE CASCADE,
  user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (ad_id, user_id)
);

ALTER TABLE public.campus_ad_likes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "ad_likes_select" ON public.campus_ad_likes;
CREATE POLICY "ad_likes_select" ON public.campus_ad_likes
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "ad_likes_insert" ON public.campus_ad_likes;
CREATE POLICY "ad_likes_insert" ON public.campus_ad_likes
  FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "ad_likes_delete" ON public.campus_ad_likes;
CREATE POLICY "ad_likes_delete" ON public.campus_ad_likes
  FOR DELETE USING (auth.uid() = user_id);

-- ── 3. Create campus_ad_comments ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.campus_ad_comments (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ad_id       uuid NOT NULL REFERENCES public.campus_ads(id) ON DELETE CASCADE,
  user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  content     text NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.campus_ad_comments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "ad_comments_select" ON public.campus_ad_comments;
CREATE POLICY "ad_comments_select" ON public.campus_ad_comments
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "ad_comments_insert" ON public.campus_ad_comments;
CREATE POLICY "ad_comments_insert" ON public.campus_ad_comments
  FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "ad_comments_delete" ON public.campus_ad_comments;
CREATE POLICY "ad_comments_delete" ON public.campus_ad_comments
  FOR DELETE USING (auth.uid() = user_id);

-- ── 4. RPCs for Liking / Unliking Ads ────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.like_ad(p_ad_id uuid, p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.campus_ad_likes(ad_id, user_id)
  VALUES (p_ad_id, p_user_id)
  ON CONFLICT DO NOTHING;

  UPDATE public.campus_ads
  SET likes_count = likes_count + 1
  WHERE id = p_ad_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.unlike_ad(p_ad_id uuid, p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM public.campus_ad_likes
  WHERE ad_id = p_ad_id AND user_id = p_user_id;

  IF FOUND THEN
    UPDATE public.campus_ads
    SET likes_count = GREATEST(0, likes_count - 1)
    WHERE id = p_ad_id;
  END IF;
END;
$$;

-- ── 5. RPCs for Comment Counters ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.increment_ad_comments()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE public.campus_ads
  SET comments_count = comments_count + 1
  WHERE id = NEW.ad_id;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.decrement_ad_comments()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE public.campus_ads
  SET comments_count = GREATEST(0, comments_count - 1)
  WHERE id = OLD.ad_id;
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS ad_comment_added ON public.campus_ad_comments;
CREATE TRIGGER ad_comment_added
  AFTER INSERT ON public.campus_ad_comments
  FOR EACH ROW EXECUTE FUNCTION public.increment_ad_comments();

DROP TRIGGER IF EXISTS ad_comment_removed ON public.campus_ad_comments;
CREATE TRIGGER ad_comment_removed
  AFTER DELETE ON public.campus_ad_comments
  FOR EACH ROW EXECUTE FUNCTION public.decrement_ad_comments();

-- Allow execute permissions
GRANT EXECUTE ON FUNCTION public.like_ad   TO authenticated;
GRANT EXECUTE ON FUNCTION public.unlike_ad TO authenticated;
