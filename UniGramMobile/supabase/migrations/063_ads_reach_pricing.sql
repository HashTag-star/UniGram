-- ============================================================
-- 063_ads_reach_pricing.sql  (Kofi Asante — Backend)
-- Wider reach costs more. Every billed impression/click is multiplied by a
-- reach_factor derived from how many campuses the campaign targets:
--   own campus only ........ x1.0
--   N selected campuses .... x(1 + step * (N-1)), capped at max_factor
--   all campuses ........... x max_factor
-- The minimum budget scales by the same factor.
-- ============================================================
ALTER TABLE public.ad_pricing
  ADD COLUMN IF NOT EXISTS campus_step_pct int NOT NULL DEFAULT 40,
  ADD COLUMN IF NOT EXISTS max_factor_pct  int NOT NULL DEFAULT 300;

ALTER TABLE public.campus_ads
  ADD COLUMN IF NOT EXISTS reach_factor numeric(5,2) NOT NULL DEFAULT 1.0;

CREATE OR REPLACE FUNCTION public.ad_reach_factor(p_all boolean, p_campuses text[], p_own text)
RETURNS numeric LANGUAGE plpgsql STABLE AS $$
DECLARE pr public.ad_pricing%ROWTYPE; n int; f numeric;
BEGIN
  SELECT * INTO pr FROM public.ad_pricing WHERE id = 1;
  IF p_all THEN RETURN pr.max_factor_pct / 100.0; END IF;
  SELECT count(DISTINCT c) INTO n FROM unnest(COALESCE(p_campuses, '{}') || CASE WHEN p_own IS NULL THEN '{}'::text[] ELSE ARRAY[p_own] END) c;
  n := GREATEST(n, 1);
  f := 1 + (pr.campus_step_pct / 100.0) * (n - 1);
  RETURN LEAST(f, pr.max_factor_pct / 100.0);
END;
$$;

CREATE OR REPLACE FUNCTION public.fn_ad_reach()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE pr public.ad_pricing%ROWTYPE;
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.funded_pesewas > 0 THEN
    NEW.reach_factor := OLD.reach_factor;
    NEW.target_all_campuses := OLD.target_all_campuses;
    NEW.target_universities := OLD.target_universities;
    RETURN NEW;
  END IF;
  NEW.reach_factor := public.ad_reach_factor(NEW.target_all_campuses, NEW.target_universities, NEW.university);
  IF current_user IN ('authenticated', 'anon') THEN
    SELECT * INTO pr FROM public.ad_pricing WHERE id = 1;
    IF NEW.budget < ceil(pr.min_budget_ghs * NEW.reach_factor) THEN
      RAISE EXCEPTION 'Minimum budget for this audience is GHS %', ceil(pr.min_budget_ghs * NEW.reach_factor);
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_ad_c_reach ON public.campus_ads;
CREATE TRIGGER trg_ad_c_reach BEFORE INSERT OR UPDATE ON public.campus_ads
  FOR EACH ROW EXECUTE FUNCTION public.fn_ad_reach();

-- Billing now multiplies by reach_factor
CREATE OR REPLACE FUNCTION public.record_campus_ad_impression(p_ad_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_cpm int; v_type text; v_f numeric;
BEGIN
  SELECT cpm_pesewas, bid_type, reach_factor INTO v_cpm, v_type, v_f FROM public.campus_ads WHERE id = p_ad_id;
  IF v_cpm IS NULL THEN RETURN; END IF;
  PERFORM public._bill_campus_ad(p_ad_id, CASE WHEN COALESCE(v_type, 'CPM') = 'CPC' THEN 0 ELSE v_cpm / 1000.0 * v_f END, false);
END;
$$;
CREATE OR REPLACE FUNCTION public.record_campus_ad_click(p_ad_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_cpc int; v_type text; v_f numeric;
BEGIN
  SELECT cost_per_click_pesewas, bid_type, reach_factor INTO v_cpc, v_type, v_f FROM public.campus_ads WHERE id = p_ad_id;
  IF v_cpc IS NULL THEN RETURN; END IF;
  PERFORM public._bill_campus_ad(p_ad_id, CASE WHEN v_type = 'CPC' THEN v_cpc * v_f ELSE 0 END, true);
END;
$$;

UPDATE public.campus_ads SET reach_factor = public.ad_reach_factor(target_all_campuses, target_universities, university);
