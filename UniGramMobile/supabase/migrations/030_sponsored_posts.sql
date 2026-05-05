-- Sponsored posts (admin-managed ads injected into the feed)
CREATE TABLE IF NOT EXISTS sponsored_posts (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_name text        NOT NULL,
  title         text        NOT NULL,
  body          text,
  image_url     text,
  cta_label     text        NOT NULL DEFAULT 'Learn More',
  cta_url       text,
  university    text,                        -- NULL = show to all campuses
  starts_at     timestamptz NOT NULL DEFAULT now(),
  ends_at       timestamptz,                 -- NULL = no expiry
  is_active     boolean     NOT NULL DEFAULT true,
  impressions   integer     NOT NULL DEFAULT 0,
  clicks        integer     NOT NULL DEFAULT 0,
  created_by    uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at    timestamptz NOT NULL DEFAULT now()
);

-- Only admins can manage ads; everyone can read active ones
ALTER TABLE sponsored_posts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admins_all" ON sponsored_posts
  FOR ALL USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = true)
  );

CREATE POLICY "active_ads_readable" ON sponsored_posts
  FOR SELECT USING (
    is_active = true
    AND starts_at <= now()
    AND (ends_at IS NULL OR ends_at > now())
  );

-- SECURITY DEFINER so any authenticated user can record impressions/clicks
-- without needing UPDATE on the table (which would bypass the RLS guard above)
CREATE OR REPLACE FUNCTION record_ad_impression(p_ad_id uuid)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  UPDATE sponsored_posts
  SET impressions = impressions + 1
  WHERE id = p_ad_id;
$$;

CREATE OR REPLACE FUNCTION record_ad_click(p_ad_id uuid)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  UPDATE sponsored_posts
  SET clicks = clicks + 1
  WHERE id = p_ad_id;
$$;
