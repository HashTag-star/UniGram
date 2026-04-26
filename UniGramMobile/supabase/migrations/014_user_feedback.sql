-- User content feedback: drives "Not interested" / "More like this" signals
CREATE TABLE IF NOT EXISTS user_feedback (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  target_id    uuid NOT NULL,
  target_type  text NOT NULL CHECK (target_type IN ('post', 'reel')),
  feedback_type text NOT NULL CHECK (feedback_type IN ('not_interested', 'interested')),
  author_id    uuid REFERENCES profiles(id) ON DELETE SET NULL,
  created_at   timestamptz DEFAULT now(),
  UNIQUE (user_id, target_id, feedback_type)
);

ALTER TABLE user_feedback ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "user_feedback_own" ON user_feedback;
CREATE POLICY "user_feedback_own" ON user_feedback
  FOR ALL USING (auth.uid() = user_id);
