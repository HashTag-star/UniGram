-- ── 017: campus_events ────────────────────────────────────────────────────────
-- Admin-managed events and announcements surfaced in the mobile discovery feed
-- for new users with sparse follow graphs (Single Player Mode).

CREATE TABLE IF NOT EXISTS public.campus_events (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  university  text        NOT NULL,
  title       text        NOT NULL,
  body        text,
  event_date  date,
  is_active   boolean     NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- Queries from the mobile feed: by university + active + upcoming date
CREATE INDEX IF NOT EXISTS campus_events_university_idx
  ON public.campus_events (university, is_active, event_date);

ALTER TABLE public.campus_events ENABLE ROW LEVEL SECURITY;

-- Authenticated users (mobile + admin) can read active events
CREATE POLICY "campus_events: authenticated read"
  ON public.campus_events FOR SELECT
  TO authenticated
  USING (is_active = true);

-- Authenticated users (admin dashboard) can insert/update/delete
CREATE POLICY "campus_events: authenticated insert"
  ON public.campus_events FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "campus_events: authenticated update"
  ON public.campus_events FOR UPDATE
  TO authenticated
  USING (true);

CREATE POLICY "campus_events: authenticated delete"
  ON public.campus_events FOR DELETE
  TO authenticated
  USING (true);
