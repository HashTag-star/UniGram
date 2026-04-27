-- ── 016: user_preferences, interactions, connection_moments, RPCs, cron ──────

-- ── 1. user_preferences ──────────────────────────────────────────────────────
-- Stores per-user interest affinity weights learned from session interactions.
-- Seeded at onboarding from the user's selected interests.

CREATE TABLE IF NOT EXISTS public.user_preferences (
  user_id              uuid        PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  affinities           jsonb       NOT NULL DEFAULT '{}',
  university_affinities jsonb      NOT NULL DEFAULT '{}',
  updated_at           timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.user_preferences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "user_preferences: own read"
  ON public.user_preferences FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "user_preferences: own insert"
  ON public.user_preferences FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "user_preferences: own update"
  ON public.user_preferences FOR UPDATE
  USING (auth.uid() = user_id);


-- ── 2. interactions ───────────────────────────────────────────────────────────
-- Client-side batch queue writes here (usePostTracker). Rows are consumed by
-- updateUserPreferences and then marked processed = true.

CREATE TABLE IF NOT EXISTS public.interactions (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  post_id     uuid        NOT NULL REFERENCES public.posts(id)    ON DELETE CASCADE,
  type        text        NOT NULL CHECK (type IN ('like','comment','save','share','dwell')),
  duration_ms integer,
  processed   boolean     NOT NULL DEFAULT false,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- Fast lookup of unprocessed rows per user (the primary query in preferences.ts)
CREATE INDEX IF NOT EXISTS interactions_user_unprocessed_idx
  ON public.interactions (user_id) WHERE processed = false;

-- Cleanup index — lets a pg_cron job purge old processed rows cheaply
CREATE INDEX IF NOT EXISTS interactions_processed_created_idx
  ON public.interactions (processed, created_at);

ALTER TABLE public.interactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "interactions: own insert"
  ON public.interactions FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "interactions: own read"
  ON public.interactions FOR SELECT
  USING (auth.uid() = user_id);


-- ── 3. mark_interactions_processed RPC ───────────────────────────────────────
-- Called after updateUserPreferences has consumed a user's rows so they aren't
-- re-processed on the next session.

CREATE OR REPLACE FUNCTION public.mark_interactions_processed(p_user_id uuid)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.interactions
  SET processed = true
  WHERE user_id = p_user_id
    AND processed = false;
$$;

GRANT EXECUTE ON FUNCTION public.mark_interactions_processed(uuid) TO authenticated;


-- ── 4. connection_moments ─────────────────────────────────────────────────────
-- Populated by a trigger when two users from the same university both like the
-- same post. Surfaced in the CommunityPulse banner on the feed.

CREATE TABLE IF NOT EXISTS public.connection_moments (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_a_id  uuid        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  user_b_id  uuid        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  university text        NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Primary query: latest moments for a university
CREATE INDEX IF NOT EXISTS connection_moments_university_idx
  ON public.connection_moments (university, created_at DESC);

-- Dedup check in the trigger
CREATE INDEX IF NOT EXISTS connection_moments_pair_idx
  ON public.connection_moments (university, user_a_id, user_b_id);

ALTER TABLE public.connection_moments ENABLE ROW LEVEL SECURITY;

-- Authenticated users can read moments from their own university
CREATE POLICY "connection_moments: authenticated read"
  ON public.connection_moments FOR SELECT
  TO authenticated
  USING (true);


-- ── 5. Trigger: create connection moments on post likes ───────────────────────

CREATE OR REPLACE FUNCTION public.trg_create_connection_moment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_my_uni       text;
  v_other_user   uuid;
BEGIN
  -- Resolve the liker's university
  SELECT university INTO v_my_uni
  FROM public.profiles
  WHERE id = NEW.user_id;

  IF v_my_uni IS NULL THEN RETURN NEW; END IF;

  -- Find one other user who already liked the same post from the same university
  SELECT pl.user_id INTO v_other_user
  FROM public.post_likes pl
  JOIN public.profiles p ON p.id = pl.user_id
  WHERE pl.post_id  = NEW.post_id
    AND pl.user_id != NEW.user_id
    AND p.university = v_my_uni
  LIMIT 1;

  IF v_other_user IS NULL THEN RETURN NEW; END IF;

  -- 24-hour dedup: don't spam moments for the same pair
  IF EXISTS (
    SELECT 1 FROM public.connection_moments
    WHERE university = v_my_uni
      AND created_at > now() - INTERVAL '24 hours'
      AND (
        (user_a_id = NEW.user_id    AND user_b_id = v_other_user)
        OR
        (user_a_id = v_other_user  AND user_b_id = NEW.user_id)
      )
  ) THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.connection_moments (user_a_id, user_b_id, university)
  VALUES (NEW.user_id, v_other_user, v_my_uni);

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_connection_moment_on_like ON public.post_likes;

CREATE TRIGGER trg_connection_moment_on_like
  AFTER INSERT ON public.post_likes
  FOR EACH ROW EXECUTE FUNCTION public.trg_create_connection_moment();


-- ── 6. get_trending_post_for_university RPC ───────────────────────────────────
-- Used by send-reengagement-notifications to find the hottest post at a campus
-- within the last 48 hours. Ranks by engagement velocity score.

CREATE OR REPLACE FUNCTION public.get_trending_post_for_university(p_university text)
RETURNS TABLE(id uuid, caption text, likes_count int, comments_count int)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    p.id,
    p.caption,
    p.likes_count,
    p.comments_count
  FROM public.posts p
  JOIN public.profiles pr ON pr.id = p.user_id
  WHERE pr.university = p_university
    AND p.created_at  > now() - INTERVAL '48 hours'
  ORDER BY
    (COALESCE(p.likes_count,    0) * 2 +
     COALESCE(p.comments_count, 0) * 5 +
     COALESCE(p.saves_count,    0) * 4) DESC
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.get_trending_post_for_university(text) TO service_role;


-- ── 7. Cleanup job: purge old processed interactions ─────────────────────────
-- Keeps the table lean. Processed rows older than 30 days have no further use.

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule('interactions-cleanup')
    WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'interactions-cleanup');

    PERFORM cron.schedule(
      'interactions-cleanup',
      '0 3 * * 0',  -- 03:00 UTC every Sunday
      $cron$
        DELETE FROM public.interactions
        WHERE processed = true
          AND created_at < now() - INTERVAL '30 days';
      $cron$
    );
  END IF;
END $$;


-- ── 8. Cron: send-reengagement-notifications ─────────────────────────────────
-- Fires every 4 hours. The edge function itself enforces a 12-hour per-user
-- cooldown so no user is nudged more than twice a day regardless of schedule.

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule('reengagement-notifications')
    WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'reengagement-notifications');

    PERFORM cron.schedule(
      'reengagement-notifications',
      '0 */4 * * *',  -- 00:00, 04:00, 08:00, 12:00, 16:00, 20:00 UTC
      $$
      SELECT net.http_post(
        url     := current_setting('app.supabase_url',    true) || '/functions/v1/send-reengagement-notifications',
        headers := jsonb_build_object(
          'Content-Type',  'application/json',
          'Authorization', 'Bearer ' || current_setting('app.service_role_key', true)
        ),
        body    := '{}'::jsonb
      );
      $$
    );
  END IF;
END $$;
