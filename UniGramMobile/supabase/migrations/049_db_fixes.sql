-- 045_db_fixes.sql
-- 1. Update the notifications type constraint to allow 're_engagement'
-- 2. Reschedule follow-suggestions and re-engagement cron jobs to read Supabase service role key dynamically from GUC settings

-- ── 1. Update Check Constraint ───────────────────────────────────────────────
ALTER TABLE public.notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
ALTER TABLE public.notifications
ADD CONSTRAINT notifications_type_check
CHECK (type IN (
    'like', 'comment', 'follow', 'mention', 'repost', 'quote', 'save',
    'live_started', 'live_ended', 'reel_like', 'reel_comment',
    'follow_suggestion', 'new_post', 'new_story', 'message', 'story_view',
    're_engagement',
    'admin_report', 'admin_verification', 'admin_ban',
    'verification_approved', 'verification_rejected',
    'announcement', 'account_suspended', 'account_unsuspended'
));

-- ── 2. Reschedule Cron Jobs with Dynamic GUC Settings ────────────────────────
DO $outer$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    -- Unschedule existing jobs
    IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'follow-suggestions-morning') THEN
      PERFORM cron.unschedule('follow-suggestions-morning');
    END IF;
    IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'follow-suggestions-evening') THEN
      PERFORM cron.unschedule('follow-suggestions-evening');
    END IF;
    IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'reengagement-notifications') THEN
      PERFORM cron.unschedule('reengagement-notifications');
    END IF;

    -- Schedule follow-suggestions-morning
    PERFORM cron.schedule(
      'follow-suggestions-morning',
      '0 8 * * *',   -- 08:00 UTC daily
      $follow_am$
      SELECT net.http_post(
        url     := COALESCE(current_setting('app.supabase_url', true), 'https://rcvzcbfmstgwzrolnhvy.supabase.co') || '/functions/v1/send-follow-suggestions',
        headers := jsonb_build_object(
          'Content-Type',   'application/json',
          'Authorization',  'Bearer ' || COALESCE(current_setting('app.service_role_key', true), 'YOUR_SERVICE_ROLE_KEY')
        ),
        body    := '{}'::jsonb
      );
      $follow_am$
    );

    -- Schedule follow-suggestions-evening
    PERFORM cron.schedule(
      'follow-suggestions-evening',
      '0 18 * * *',  -- 18:00 UTC daily
      $follow_pm$
      SELECT net.http_post(
        url     := COALESCE(current_setting('app.supabase_url', true), 'https://rcvzcbfmstgwzrolnhvy.supabase.co') || '/functions/v1/send-follow-suggestions',
        headers := jsonb_build_object(
          'Content-Type',   'application/json',
          'Authorization',  'Bearer ' || COALESCE(current_setting('app.service_role_key', true), 'YOUR_SERVICE_ROLE_KEY')
        ),
        body    := '{}'::jsonb
      );
      $follow_pm$
    );

    -- Schedule reengagement-notifications
    PERFORM cron.schedule(
      'reengagement-notifications',
      '0 */4 * * *',  -- Every 4 hours
      $body$
      SELECT net.http_post(
        url     := COALESCE(current_setting('app.supabase_url', true), 'https://rcvzcbfmstgwzrolnhvy.supabase.co') || '/functions/v1/send-reengagement-notifications',
        headers := jsonb_build_object(
          'Content-Type',  'application/json',
          'Authorization', 'Bearer ' || COALESCE(current_setting('app.service_role_key', true), 'YOUR_SERVICE_ROLE_KEY')
        ),
        body    := '{}'::jsonb
      );
      $body$
    );
  END IF;
END $outer$;
