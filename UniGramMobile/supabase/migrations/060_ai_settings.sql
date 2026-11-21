-- ============================================================
-- 060_ai_settings.sql
-- Admin-controlled AI model selection.
--
-- Edge functions read these rows (with the service role) to decide which model
-- powers each tier of AI feature. The NVIDIA API key itself is NEVER stored here:
-- it lives only in the Edge Function secrets (NVIDIA_API_KEY).
--
--   ai_provider      'nvidia' | 'auto'     (auto = use whichever key is configured)
--   ai_model_fast    cheap/quick tasks     (comment summaries, analytics insights)
--   ai_model_smart   reasoning tasks       (admin agent, moderation scans)
--   ai_model_vision  image understanding   (post context, caption assistant)
-- ============================================================

CREATE TABLE IF NOT EXISTS public.ai_settings (
  key        text PRIMARY KEY,
  value      text NOT NULL,
  updated_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.ai_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "ai_settings: admin read" ON public.ai_settings;
CREATE POLICY "ai_settings: admin read" ON public.ai_settings
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.is_admin = true));

DROP POLICY IF EXISTS "ai_settings: admin insert" ON public.ai_settings;
CREATE POLICY "ai_settings: admin insert" ON public.ai_settings
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.is_admin = true));

DROP POLICY IF EXISTS "ai_settings: admin update" ON public.ai_settings;
CREATE POLICY "ai_settings: admin update" ON public.ai_settings
  FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.is_admin = true))
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.is_admin = true));

INSERT INTO public.ai_settings (key, value) VALUES
  ('ai_provider',     'nvidia'),
  ('ai_model_fast',   'meta/llama-3.1-8b-instruct'),
  ('ai_model_smart',  'meta/llama-3.3-70b-instruct'),
  ('ai_model_vision', 'meta/llama-3.2-11b-vision-instruct')
ON CONFLICT (key) DO NOTHING;


-- ============================================================
-- Provider API key, settable from the Admin screen.
--
-- Stored in a table with RLS enabled and NO policies, so no client (not even an
-- admin) can ever SELECT it. Only edge functions (service role) read it. Admins
-- write it through the SECURITY DEFINER RPC below and can only learn whether a
-- key is set plus its last 4 characters. An NVIDIA_API_KEY edge secret, if
-- present, takes precedence.
-- ============================================================
CREATE TABLE IF NOT EXISTS public.ai_secrets (
  key        text PRIMARY KEY,
  value      text NOT NULL,
  updated_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.ai_secrets ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.ai_secrets FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.admin_set_ai_key(p_key text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = true) THEN
    RAISE EXCEPTION 'Admins only';
  END IF;
  IF p_key IS NULL OR length(btrim(p_key)) < 20 THEN
    RAISE EXCEPTION 'That does not look like a valid API key';
  END IF;
  INSERT INTO public.ai_secrets (key, value, updated_by, updated_at)
  VALUES ('nvidia_api_key', btrim(p_key), auth.uid(), now())
  ON CONFLICT (key) DO UPDATE
    SET value = EXCLUDED.value, updated_by = EXCLUDED.updated_by, updated_at = now();
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_clear_ai_key()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = true) THEN
    RAISE EXCEPTION 'Admins only';
  END IF;
  DELETE FROM public.ai_secrets WHERE key = 'nvidia_api_key';
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_ai_key_status()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v text; t timestamptz;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = true) THEN
    RAISE EXCEPTION 'Admins only';
  END IF;
  SELECT value, updated_at INTO v, t FROM public.ai_secrets WHERE key = 'nvidia_api_key';
  RETURN jsonb_build_object(
    'configured', v IS NOT NULL,
    'last4', CASE WHEN v IS NULL THEN NULL ELSE right(v, 4) END,
    'updated_at', t
  );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_set_ai_key(text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_clear_ai_key() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_ai_key_status() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_set_ai_key(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_clear_ai_key() TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_ai_key_status() TO authenticated;
