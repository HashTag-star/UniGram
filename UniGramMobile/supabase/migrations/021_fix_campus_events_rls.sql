-- 021: Tighten campus_events RLS
-- Old INSERT policy was TO authenticated WITH CHECK (true) — any user could insert.
-- New: only admins can mutate; mobile users read active events; admins read all.

DROP POLICY IF EXISTS "campus_events: authenticated read"   ON public.campus_events;
DROP POLICY IF EXISTS "campus_events: authenticated insert" ON public.campus_events;
DROP POLICY IF EXISTS "campus_events: authenticated update" ON public.campus_events;
DROP POLICY IF EXISTS "campus_events: authenticated delete" ON public.campus_events;

-- Mobile: active events only. Admins: all events.
CREATE POLICY "campus_events: read"
  ON public.campus_events FOR SELECT
  TO authenticated
  USING (
    is_active = true
    OR EXISTS (
      SELECT 1 FROM public.profiles AS _a
      WHERE _a.id = auth.uid() AND _a.is_admin = true
    )
  );

-- Mutations: admins only
CREATE POLICY "campus_events: admin insert"
  ON public.campus_events FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles AS _a
      WHERE _a.id = auth.uid() AND _a.is_admin = true
    )
  );

CREATE POLICY "campus_events: admin update"
  ON public.campus_events FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles AS _a
      WHERE _a.id = auth.uid() AND _a.is_admin = true
    )
  );

CREATE POLICY "campus_events: admin delete"
  ON public.campus_events FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles AS _a
      WHERE _a.id = auth.uid() AND _a.is_admin = true
    )
  );
