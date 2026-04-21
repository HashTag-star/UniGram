-- Voice / Video call signaling tables

CREATE TABLE IF NOT EXISTS calls (
  id            UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  conversation_id UUID REFERENCES conversations(id) ON DELETE CASCADE,
  caller_id     UUID REFERENCES profiles(id) ON DELETE CASCADE,
  callee_id     UUID REFERENCES profiles(id) ON DELETE CASCADE,
  type          TEXT NOT NULL CHECK (type IN ('audio', 'video')) DEFAULT 'audio',
  status        TEXT NOT NULL CHECK (status IN ('ringing', 'active', 'ended', 'declined', 'missed', 'busy')) DEFAULT 'ringing',
  offer         JSONB,
  answer        JSONB,
  created_at    TIMESTAMPTZ DEFAULT now(),
  ended_at      TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS call_ice_candidates (
  id         UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  call_id    UUID REFERENCES calls(id) ON DELETE CASCADE,
  sender_id  UUID REFERENCES profiles(id) ON DELETE CASCADE,
  candidate  JSONB NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_calls_callee_status  ON calls(callee_id, status);
CREATE INDEX IF NOT EXISTS idx_calls_caller         ON calls(caller_id);
CREATE INDEX IF NOT EXISTS idx_ice_call_sender      ON call_ice_candidates(call_id, sender_id);

-- RLS
ALTER TABLE calls ENABLE ROW LEVEL SECURITY;
ALTER TABLE call_ice_candidates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "call participants can read" ON calls
  FOR SELECT USING (auth.uid() = caller_id OR auth.uid() = callee_id);

CREATE POLICY "caller can insert" ON calls
  FOR INSERT WITH CHECK (auth.uid() = caller_id);

CREATE POLICY "participants can update" ON calls
  FOR UPDATE USING (auth.uid() = caller_id OR auth.uid() = callee_id);

CREATE POLICY "ice participants can read" ON call_ice_candidates
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM calls WHERE id = call_id AND (caller_id = auth.uid() OR callee_id = auth.uid()))
  );

CREATE POLICY "ice participants can insert" ON call_ice_candidates
  FOR INSERT WITH CHECK (
    auth.uid() = sender_id AND
    EXISTS (SELECT 1 FROM calls WHERE id = call_id AND (caller_id = auth.uid() OR callee_id = auth.uid()))
  );
