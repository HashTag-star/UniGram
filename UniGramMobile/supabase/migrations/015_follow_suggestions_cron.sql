-- ── 0. One-time database settings (run once in SQL editor, not in migration) ──
-- pg_cron jobs run as postgres, which can't read Supabase secrets directly.
-- Store the URL and service-role key as postgresql.conf custom settings once:
--
--   ALTER DATABASE postgres SET app.supabase_url = 'https://YOUR_PROJECT_REF.supabase.co';
--   ALTER DATABASE postgres SET app.service_role_key = 'YOUR_SERVICE_ROLE_KEY';
--
-- These are safe: the settings are only readable inside the database by the
-- postgres role; they are NOT exposed via the PostgREST API.

-- ── 1. RPC: users eligible for a follow-suggestion push ──────────────────────
-- Returns up to 150 users who:
--   a) have at least one native push token registered
--   b) have NOT received a follow_suggestion notification in the last 22 hours
-- Called by the send-follow-suggestions Edge Function.

CREATE OR REPLACE FUNCTION public.get_users_for_follow_suggestions()
RETURNS TABLE(user_id uuid)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT DISTINCT pt.user_id
  FROM push_tokens pt
  WHERE pt.type = 'native'
    AND NOT EXISTS (
      SELECT 1
      FROM notifications n
      WHERE n.user_id  = pt.user_id
        AND n.type     = 'follow_suggestion'
        AND n.created_at > NOW() - INTERVAL '22 hours'
    )
  LIMIT 150;
$$;

GRANT EXECUTE ON FUNCTION public.get_users_for_follow_suggestions() TO service_role;


-- ── 2. pg_cron + pg_net: schedule the Edge Function ──────────────────────────
-- pg_cron and pg_net are enabled by default on Supabase Pro/Team.
-- The job calls the Edge Function twice a day (08:00 UTC and 18:00 UTC) so
-- users in different time zones get suggestions at a reasonable local hour.
-- The SUPABASE_URL and SERVICE_ROLE_KEY are stored as Vault secrets; reading
-- them via current_setting() keeps credentials out of cron job text.

-- Replace YOUR_SERVICE_ROLE_KEY with the value from Supabase dashboard → Settings → API.
DO $outer$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'follow-suggestions-morning') THEN
      PERFORM cron.unschedule('follow-suggestions-morning');
    END IF;
    IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'follow-suggestions-evening') THEN
      PERFORM cron.unschedule('follow-suggestions-evening');
    END IF;

    PERFORM cron.schedule(
      'follow-suggestions-morning',
      '0 8 * * *',   -- 08:00 UTC daily
      $follow_am$
      SELECT net.http_post(
        url     := 'https://rcvzcbfmstgwzrolnhvy.supabase.co/functions/v1/send-follow-suggestions',
        headers := jsonb_build_object(
          'Content-Type',   'application/json',
          'Authorization',  'Bearer YOUR_SERVICE_ROLE_KEY'
        ),
        body    := '{}'::jsonb
      );
      $follow_am$
    );

    PERFORM cron.schedule(
      'follow-suggestions-evening',
      '0 18 * * *',  -- 18:00 UTC daily
      $follow_pm$
      SELECT net.http_post(
        url     := 'https://rcvzcbfmstgwzrolnhvy.supabase.co/functions/v1/send-follow-suggestions',
        headers := jsonb_build_object(
          'Content-Type',   'application/json',
          'Authorization',  'Bearer YOUR_SERVICE_ROLE_KEY'
        ),
        body    := '{}'::jsonb
      );
      $follow_pm$
    );
  END IF;
END $outer$;
