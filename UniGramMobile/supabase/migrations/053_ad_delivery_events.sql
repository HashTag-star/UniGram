-- Placement-aware, deduplicated delivery measurement.
-- A campaign can be billed at most once per viewer, placement and UTC day.
CREATE TABLE IF NOT EXISTS public.campus_ad_delivery_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ad_id uuid NOT NULL REFERENCES public.campus_ads(id) ON DELETE CASCADE,
  viewer_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  placement text NOT NULL CHECK (placement IN ('feed', 'stories', 'reels', 'market', 'explore')),
  event_type text NOT NULL CHECK (event_type IN ('impression', 'click')),
  delivery_date date NOT NULL DEFAULT CURRENT_DATE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (ad_id, viewer_id, placement, event_type, delivery_date)
);

ALTER TABLE public.campus_ad_delivery_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ad_delivery_viewer_insert" ON public.campus_ad_delivery_events
  FOR INSERT WITH CHECK (viewer_id = auth.uid());
CREATE POLICY "ad_delivery_viewer_select" ON public.campus_ad_delivery_events
  FOR SELECT USING (viewer_id = auth.uid());

CREATE OR REPLACE FUNCTION public.record_campus_ad_delivery(p_ad_id uuid, p_placement text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  INSERT INTO public.campus_ad_delivery_events (ad_id, viewer_id, placement, event_type)
  VALUES (p_ad_id, auth.uid(), p_placement, 'impression') ON CONFLICT DO NOTHING;
  IF FOUND THEN
    PERFORM public.record_campus_ad_impression(p_ad_id);
    RETURN true;
  END IF;
  RETURN false;
END;
$$;

CREATE OR REPLACE FUNCTION public.record_campus_ad_click_event(p_ad_id uuid, p_placement text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  INSERT INTO public.campus_ad_delivery_events (ad_id, viewer_id, placement, event_type)
  VALUES (p_ad_id, auth.uid(), p_placement, 'click') ON CONFLICT DO NOTHING;
  IF FOUND THEN
    PERFORM public.record_campus_ad_click(p_ad_id);
    RETURN true;
  END IF;
  RETURN false;
END;
$$;

GRANT EXECUTE ON FUNCTION public.record_campus_ad_delivery(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.record_campus_ad_click_event(uuid, text) TO authenticated;
