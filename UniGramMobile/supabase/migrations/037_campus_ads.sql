-- Self-serve campus ad campaigns (user-created, multi-format)
-- NOTE: Create an 'ad-media' storage bucket in the Supabase Dashboard
--       with public read access before deploying this migration.

CREATE TABLE IF NOT EXISTS campus_ads (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name         text NOT NULL,
  objective    text NOT NULL CHECK (objective IN ('awareness','traffic','engagement','sales')),
  format       text NOT NULL CHECK (format IN ('image','video','carousel','text')),
  placements   text[] NOT NULL DEFAULT '{}',
  headline     text NOT NULL,
  body         text,
  cta          text NOT NULL DEFAULT 'Learn More',
  link         text,
  media_url    text,
  cards        jsonb,          -- carousel: [{title,price,link,image_url}]
  status       text NOT NULL DEFAULT 'pending' CHECK (status IN ('active','paused','ended','pending')),
  budget       integer NOT NULL,        -- GHS whole number
  spent        integer NOT NULL DEFAULT 0,
  impressions  integer NOT NULL DEFAULT 0,
  clicks       integer NOT NULL DEFAULT 0,
  payment_ref  text,
  university   text,
  start_date   timestamptz,
  end_date     timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS campus_ads_user_idx    ON campus_ads(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS campus_ads_active_idx  ON campus_ads(status, university) WHERE status = 'active';

ALTER TABLE campus_ads ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "campus_ads_owner_select" ON campus_ads;
CREATE POLICY "campus_ads_owner_select" ON campus_ads
  FOR SELECT USING (user_id = auth.uid());

DROP POLICY IF EXISTS "campus_ads_owner_update" ON campus_ads;
CREATE POLICY "campus_ads_owner_update" ON campus_ads
  FOR UPDATE USING (user_id = auth.uid());

DROP POLICY IF EXISTS "campus_ads_owner_delete" ON campus_ads;
CREATE POLICY "campus_ads_owner_delete" ON campus_ads
  FOR DELETE USING (user_id = auth.uid());

DROP POLICY IF EXISTS "campus_ads_insert" ON campus_ads;
CREATE POLICY "campus_ads_insert" ON campus_ads
  FOR INSERT WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "campus_ads_active_readable" ON campus_ads;
CREATE POLICY "campus_ads_active_readable" ON campus_ads
  FOR SELECT USING (
    status = 'active'
    AND (start_date IS NULL OR start_date <= now())
    AND (end_date IS NULL OR end_date > now())
  );

-- SECURITY DEFINER so the ad-serving layer can count impressions/clicks
-- without needing UPDATE access on the whole table.
CREATE OR REPLACE FUNCTION record_campus_ad_impression(p_ad_id uuid)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  UPDATE campus_ads SET impressions = impressions + 1 WHERE id = p_ad_id;
$$;

CREATE OR REPLACE FUNCTION record_campus_ad_click(p_ad_id uuid)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  UPDATE campus_ads SET clicks = clicks + 1 WHERE id = p_ad_id;
$$;
