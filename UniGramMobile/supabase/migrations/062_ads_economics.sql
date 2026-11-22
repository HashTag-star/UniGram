-- ============================================================
-- 062_ads_economics.sql  (Kofi Asante — Backend)
-- Meta-style ad money model:
--   * PREPAID + FUNDED: a campaign can only serve once real money (Paystack or
--     account credit) has been put against it (funded_pesewas >= budget).
--   * Advertisers can no longer self-activate / edit spend, funding or counters
--     (RLS let owners UPDATE any column before — they could go live for free).
--   * FLOOR PRICES (ad_pricing): minimum CPM / CPC so a bid of 0 can't serve free.
--   * Fractional billing: CPM billed per impression as cpm/1000 pesewas.
--   * HARD STOP at funded money; DAILY BUDGET pacing (max 125% of budget/days/day,
--     like Meta's overdelivery allowance).
--   * EXPIRY: expire_campus_ads() ends campaigns past end_date or out of money (cron).
--   * REFUND of unspent funds to ad credit when a campaign ends/is rejected.
-- ============================================================

-- ─── Pricing config (admin-editable singleton) ───────────────
CREATE TABLE IF NOT EXISTS public.ad_pricing (
  id                 integer PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  min_cpm_pesewas    integer NOT NULL DEFAULT 800,   -- GHS 8.00 per 1000 impressions
  min_cpc_pesewas    integer NOT NULL DEFAULT 30,    -- GHS 0.30 per click
  default_cpm_pesewas integer NOT NULL DEFAULT 1200, -- GHS 12.00 CPM when no bid given
  min_budget_ghs     integer NOT NULL DEFAULT 5,
  overdelivery_pct   integer NOT NULL DEFAULT 125    -- daily cap = budget/days * this %
);
INSERT INTO public.ad_pricing (id) VALUES (1) ON CONFLICT DO NOTHING;
ALTER TABLE public.ad_pricing ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS ad_pricing_read ON public.ad_pricing;
CREATE POLICY ad_pricing_read ON public.ad_pricing FOR SELECT USING (true);

-- ─── Columns ─────────────────────────────────────────────────
ALTER TABLE public.campus_ads
  ADD COLUMN IF NOT EXISTS funded_pesewas        integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS cpm_pesewas           integer NOT NULL DEFAULT 1200,
  ADD COLUMN IF NOT EXISTS daily_spent_pesewas   numeric(14,4) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS daily_spent_date      date,
  ADD COLUMN IF NOT EXISTS daily_throttled_date  date;

ALTER TABLE public.campus_ads ALTER COLUMN spent_pesewas TYPE numeric(14,4);

-- Existing campaigns that were actually paid keep serving; unpaid ones must be funded.
UPDATE public.campus_ads SET funded_pesewas = budget * 100
WHERE funded_pesewas = 0 AND payment_ref IS NOT NULL;
UPDATE public.campus_ads SET cpm_pesewas = 1200 WHERE cpm_pesewas IS NULL OR cpm_pesewas < 800;

-- ─── Idempotent funding journal ──────────────────────────────
CREATE TABLE IF NOT EXISTS public.ad_funding_events (
  reference   text PRIMARY KEY,
  campaign_id uuid REFERENCES public.campus_ads(id) ON DELETE SET NULL,
  pesewas     integer NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.ad_funding_events ENABLE ROW LEVEL SECURITY;

-- ─── Serving policy: needs money + not throttled today ───────
DROP POLICY IF EXISTS "campus_ads_active_readable" ON public.campus_ads;
CREATE POLICY "campus_ads_active_readable" ON public.campus_ads
  FOR SELECT USING (
    status = 'active'
    AND funded_pesewas > 0
    AND spent_pesewas < funded_pesewas
    AND (start_date IS NULL OR start_date <= now())
    AND (end_date IS NULL OR end_date > now())
    AND daily_throttled_date IS DISTINCT FROM CURRENT_DATE
  );

-- ─── Guard: stop owners touching money/state directly ────────
CREATE OR REPLACE FUNCTION public.fn_ad_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  p public.ad_pricing%ROWTYPE;
BEGIN
  -- Server paths (SECURITY DEFINER RPCs run as postgres, edge functions as service_role) are trusted.
  IF current_user NOT IN ('authenticated', 'anon') THEN RETURN NEW; END IF;

  SELECT * INTO p FROM public.ad_pricing WHERE id = 1;

  IF TG_OP = 'INSERT' THEN
    NEW.status := 'pending';
    NEW.funded_pesewas := 0;  NEW.spent_pesewas := 0;  NEW.spent := 0;
    NEW.impressions := 0;     NEW.clicks := 0;
    NEW.daily_spent_pesewas := 0; NEW.daily_spent_date := NULL; NEW.daily_throttled_date := NULL;
    IF NEW.budget < p.min_budget_ghs THEN
      RAISE EXCEPTION 'Minimum campaign budget is GHS %', p.min_budget_ghs;
    END IF;
  ELSE
    -- Counters and money are server-owned
    NEW.funded_pesewas := OLD.funded_pesewas;
    NEW.spent_pesewas  := OLD.spent_pesewas;
    NEW.spent          := OLD.spent;
    NEW.impressions    := OLD.impressions;
    NEW.clicks         := OLD.clicks;
    NEW.daily_spent_pesewas  := OLD.daily_spent_pesewas;
    NEW.daily_spent_date     := OLD.daily_spent_date;
    NEW.daily_throttled_date := OLD.daily_throttled_date;
    -- Once money is on the campaign, pricing/budget/schedule are locked
    IF OLD.funded_pesewas > 0 THEN
      NEW.budget := OLD.budget;
      NEW.cpm_pesewas := OLD.cpm_pesewas;
      NEW.cost_per_click_pesewas := OLD.cost_per_click_pesewas;
      NEW.cost_per_impression_pesewas := OLD.cost_per_impression_pesewas;
      NEW.end_date := OLD.end_date;
      NEW.start_date := OLD.start_date;
    END IF;
    -- Terminal states are final
    IF OLD.status IN ('ended', 'rejected') THEN NEW.status := OLD.status; END IF;
    -- Going live needs full funding
    IF NEW.status = 'active' AND OLD.status IS DISTINCT FROM 'active' THEN
      IF NEW.funded_pesewas < NEW.budget * 100 OR NEW.spent_pesewas >= NEW.funded_pesewas THEN
        RAISE EXCEPTION 'Campaign must be fully paid before it can run';
      END IF;
      IF NEW.end_date IS NOT NULL AND NEW.end_date <= now() THEN
        RAISE EXCEPTION 'Campaign has expired';
      END IF;
    END IF;
  END IF;

  -- Floor prices
  IF COALESCE(NEW.bid_type, 'CPM') = 'CPC' THEN
    IF COALESCE(NEW.cost_per_click_pesewas, 0) < p.min_cpc_pesewas THEN
      NEW.cost_per_click_pesewas := p.min_cpc_pesewas;
    END IF;
  ELSE
    IF COALESCE(NEW.cpm_pesewas, 0) < p.min_cpm_pesewas THEN
      NEW.cpm_pesewas := p.default_cpm_pesewas;
    END IF;
  END IF;
  NEW.cost_per_impression_pesewas :=
    CASE WHEN COALESCE(NEW.cpm_pesewas, 0) > 0 AND COALESCE(NEW.bid_type, 'CPM') <> 'CPC'
         THEN GREATEST(1, round(NEW.cpm_pesewas / 1000.0)::int) ELSE 0 END;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_ad_a_guard ON public.campus_ads;
CREATE TRIGGER trg_ad_a_guard BEFORE INSERT OR UPDATE ON public.campus_ads
  FOR EACH ROW EXECUTE FUNCTION public.fn_ad_guard();

-- ─── Refund unspent funds when a campaign ends / is rejected ─
DROP TRIGGER IF EXISTS trg_refund_unused_budget ON public.campus_ads;
CREATE OR REPLACE FUNCTION public.fn_refund_unused_budget()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_refund integer;
BEGIN
  IF NEW.status IN ('ended', 'rejected') AND OLD.status IS DISTINCT FROM NEW.status THEN
    v_refund := floor(NEW.funded_pesewas - NEW.spent_pesewas)::int;
    IF v_refund > 0 THEN
      UPDATE public.profiles SET ad_credit_pesewas = ad_credit_pesewas + v_refund WHERE id = NEW.user_id;
      INSERT INTO public.ad_credit_ledger (user_id, campaign_id, delta_pesewas, reason)
      VALUES (NEW.user_id, NEW.id, v_refund, CASE WHEN NEW.status = 'ended' THEN 'refund_ended' ELSE 'refund_rejected' END);
      NEW.funded_pesewas := floor(NEW.spent_pesewas)::int;  -- can't be refunded twice
    END IF;
    IF NEW.end_date IS NULL OR NEW.end_date > now() THEN NEW.end_date := now(); END IF;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_ad_b_refund ON public.campus_ads;
CREATE TRIGGER trg_ad_b_refund BEFORE UPDATE OF status ON public.campus_ads
  FOR EACH ROW EXECUTE FUNCTION public.fn_refund_unused_budget();

-- ─── Metered billing (shared by impression + click) ──────────
CREATE OR REPLACE FUNCTION public._bill_campus_ad(p_ad_id uuid, p_amount numeric, p_is_click boolean)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  a public.campus_ads%ROWTYPE;
  pr public.ad_pricing%ROWTYPE;
  v_days int;
  v_daily_cap numeric;
  v_today_spent numeric;
  v_new_spent numeric;
BEGIN
  SELECT * INTO a FROM public.campus_ads WHERE id = p_ad_id FOR UPDATE;
  IF NOT FOUND OR a.status <> 'active' THEN RETURN; END IF;
  IF a.spent_pesewas >= a.funded_pesewas THEN RETURN; END IF;       -- hard stop at funded money
  SELECT * INTO pr FROM public.ad_pricing WHERE id = 1;

  v_days := GREATEST(1, ceil(EXTRACT(EPOCH FROM (COALESCE(a.end_date, now() + interval '30 days') - COALESCE(a.start_date, a.created_at))) / 86400.0)::int);
  v_daily_cap := (a.budget * 100.0 / v_days) * pr.overdelivery_pct / 100.0;
  v_today_spent := CASE WHEN a.daily_spent_date = CURRENT_DATE THEN a.daily_spent_pesewas ELSE 0 END;
  IF v_days > 1 AND v_today_spent >= v_daily_cap THEN
    UPDATE public.campus_ads SET daily_throttled_date = CURRENT_DATE WHERE id = p_ad_id;
    RETURN;
  END IF;

  v_new_spent := LEAST(a.funded_pesewas::numeric, a.spent_pesewas + p_amount);
  UPDATE public.campus_ads SET
    impressions = impressions + CASE WHEN p_is_click THEN 0 ELSE 1 END,
    clicks      = clicks      + CASE WHEN p_is_click THEN 1 ELSE 0 END,
    spent_pesewas = v_new_spent,
    spent = floor(v_new_spent / 100)::int,
    daily_spent_pesewas = v_today_spent + p_amount,
    daily_spent_date = CURRENT_DATE,
    status = CASE WHEN v_new_spent >= a.funded_pesewas THEN 'ended' ELSE status END,
    end_date = CASE WHEN v_new_spent >= a.funded_pesewas THEN now() ELSE end_date END
  WHERE id = p_ad_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.record_campus_ad_impression(p_ad_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_cpm int; v_type text;
BEGIN
  SELECT cpm_pesewas, bid_type INTO v_cpm, v_type FROM public.campus_ads WHERE id = p_ad_id;
  IF v_cpm IS NULL THEN RETURN; END IF;
  PERFORM public._bill_campus_ad(p_ad_id, CASE WHEN COALESCE(v_type, 'CPM') = 'CPC' THEN 0 ELSE v_cpm / 1000.0 END, false);
END;
$$;

CREATE OR REPLACE FUNCTION public.record_campus_ad_click(p_ad_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_cpc int; v_type text;
BEGIN
  SELECT cost_per_click_pesewas, bid_type INTO v_cpc, v_type FROM public.campus_ads WHERE id = p_ad_id;
  IF v_cpc IS NULL THEN RETURN; END IF;
  -- CPM campaigns are paid per impression; clicks are tracked but free.
  PERFORM public._bill_campus_ad(p_ad_id, CASE WHEN v_type = 'CPC' THEN v_cpc ELSE 0 END, true);
END;
$$;
REVOKE ALL ON FUNCTION public._bill_campus_ad(uuid, numeric, boolean) FROM PUBLIC, anon, authenticated;

-- ─── Funding: credit (user) and Paystack (server) ────────────
DROP FUNCTION IF EXISTS public.consume_ad_credit(uuid, integer);
CREATE OR REPLACE FUNCTION public.consume_ad_credit(p_campaign_id uuid, p_max_pesewas integer, p_duration_days integer DEFAULT 7)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  a public.campus_ads%ROWTYPE;
  v_available integer;
  v_consume integer;
BEGIN
  SELECT * INTO a FROM public.campus_ads WHERE id = p_campaign_id FOR UPDATE;
  IF NOT FOUND OR a.user_id <> auth.uid() THEN RAISE EXCEPTION 'Not your campaign'; END IF;
  IF a.status NOT IN ('pending', 'paused') THEN RETURN 0; END IF;

  SELECT ad_credit_pesewas INTO v_available FROM public.profiles WHERE id = a.user_id FOR UPDATE;
  v_consume := LEAST(COALESCE(v_available, 0), GREATEST(p_max_pesewas, 0), GREATEST(a.budget * 100 - a.funded_pesewas, 0));
  IF v_consume <= 0 THEN RETURN 0; END IF;

  UPDATE public.profiles SET ad_credit_pesewas = ad_credit_pesewas - v_consume WHERE id = a.user_id;
  INSERT INTO public.ad_credit_ledger (user_id, campaign_id, delta_pesewas, reason)
  VALUES (a.user_id, a.id, -v_consume, 'consumed_on_create');

  UPDATE public.campus_ads SET
    funded_pesewas = funded_pesewas + v_consume,
    status = CASE WHEN status = 'pending' AND funded_pesewas + v_consume >= budget * 100 THEN 'active' ELSE status END,
    start_date = CASE WHEN status = 'pending' AND funded_pesewas + v_consume >= budget * 100 THEN now() ELSE start_date END,
    end_date = CASE WHEN status = 'pending' AND funded_pesewas + v_consume >= budget * 100
                    THEN now() + make_interval(days => GREATEST(1, LEAST(p_duration_days, 90))) ELSE end_date END
  WHERE id = a.id;
  RETURN v_consume;
END;
$$;
GRANT EXECUTE ON FUNCTION public.consume_ad_credit(uuid, integer, integer) TO authenticated;

CREATE OR REPLACE FUNCTION public.fund_campus_ad(p_campaign_id uuid, p_reference text, p_pesewas integer, p_days integer DEFAULT 7)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.ad_funding_events (reference, campaign_id, pesewas)
  VALUES (p_reference, p_campaign_id, p_pesewas) ON CONFLICT DO NOTHING;
  IF NOT FOUND THEN RETURN false; END IF;   -- already applied (webhook + verify both call this)

  UPDATE public.campus_ads SET
    funded_pesewas = funded_pesewas + p_pesewas,
    status = CASE WHEN status = 'pending' AND funded_pesewas + p_pesewas >= budget * 100 THEN 'active' ELSE status END,
    start_date = CASE WHEN status = 'pending' AND funded_pesewas + p_pesewas >= budget * 100 THEN now() ELSE start_date END,
    end_date = CASE WHEN status = 'pending' AND funded_pesewas + p_pesewas >= budget * 100
                    THEN now() + make_interval(days => GREATEST(1, LEAST(p_days, 90))) ELSE end_date END
  WHERE id = p_campaign_id;
  RETURN true;
END;
$$;
REVOKE ALL ON FUNCTION public.fund_campus_ad(uuid, text, integer, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fund_campus_ad(uuid, text, integer, integer) TO service_role;

-- ─── Expiry sweep ────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.expire_campus_ads()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE n integer;
BEGIN
  UPDATE public.campus_ads SET status = 'ended'
  WHERE status IN ('active', 'paused')
    AND ((end_date IS NOT NULL AND end_date <= now()) OR (funded_pesewas > 0 AND spent_pesewas >= funded_pesewas));
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END;
$$;
REVOKE ALL ON FUNCTION public.expire_campus_ads() FROM PUBLIC, anon, authenticated;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule(jobid) FROM cron.job WHERE jobname = 'expire-campus-ads';
    PERFORM cron.schedule('expire-campus-ads', '*/10 * * * *', 'SELECT public.expire_campus_ads()');
  END IF;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'pg_cron scheduling skipped: %', SQLERRM;
END $$;

SELECT public.expire_campus_ads();
