-- AI context cache: stores per-post misinformation analysis results
-- Written by the post-ai-context edge function, read by all clients

CREATE TABLE IF NOT EXISTS post_ai_context (
  post_id               uuid        PRIMARY KEY REFERENCES posts(id) ON DELETE CASCADE,
  context_type          text        NOT NULL CHECK (context_type IN ('none', 'info', 'warning', 'misleading')),
  context_text          text        NOT NULL DEFAULT '',
  detail_text           text        NOT NULL DEFAULT '',
  confidence            float       NOT NULL DEFAULT 0,
  analyzed_with_vision  boolean     NOT NULL DEFAULT false,
  analyzed_at           timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE post_ai_context ENABLE ROW LEVEL SECURITY;

-- Anyone can read AI context (public feed feature)
DROP POLICY IF EXISTS "public_read_ai_context" ON post_ai_context;
CREATE POLICY "public_read_ai_context"
  ON post_ai_context FOR SELECT
  USING (true);

-- Only the service role (edge function) may write — no direct client inserts
