-- 064: simulated ad payments (test mode) until the real paywall is plugged in.
-- Flip ad_pricing.simulated_payments to false to disable this path server-side.
ALTER TABLE public.ad_pricing ADD COLUMN IF NOT EXISTS simulated_payments boolean NOT NULL DEFAULT true;

CREATE OR REPLACE FUNCTION public.simulate_fund_campaign(p_campaign_id uuid, p_days integer DEFAULT 7)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE a public.campus_ads%ROWTYPE; v_need integer;
BEGIN
  IF NOT (SELECT simulated_payments FROM public.ad_pricing WHERE id = 1) THEN
    RAISE EXCEPTION 'Simulated payments are disabled';
  END IF;
  SELECT * INTO a FROM public.campus_ads WHERE id = p_campaign_id FOR UPDATE;
  IF NOT FOUND OR a.user_id <> auth.uid() THEN RAISE EXCEPTION 'Not your campaign'; END IF;
  v_need := a.budget * 100 - a.funded_pesewas;
  IF v_need <= 0 THEN RETURN true; END IF;
  RETURN public.fund_campus_ad(p_campaign_id, 'sim_' || gen_random_uuid()::text, v_need, p_days);
END;
$$;
REVOKE ALL ON FUNCTION public.simulate_fund_campaign(uuid, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.simulate_fund_campaign(uuid, integer) TO authenticated;
