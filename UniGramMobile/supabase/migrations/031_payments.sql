-- Payments tracking table
CREATE TABLE IF NOT EXISTS payments (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  reference    text NOT NULL UNIQUE,
  amount       integer NOT NULL,      -- in pesewas (GHS × 100)
  currency     text NOT NULL DEFAULT 'GHS',
  status       text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'success', 'failed')),
  product_type text NOT NULL,         -- 'market_boost' | 'pro_sub' | 'ad_payment'
  product_id   text,
  metadata     jsonb,
  created_at   timestamptz NOT NULL DEFAULT now(),
  verified_at  timestamptz
);

ALTER TABLE payments ENABLE ROW LEVEL SECURITY;

-- Users can only see their own payment records
CREATE POLICY "users_own_payments" ON payments
  FOR SELECT USING (user_id = auth.uid());

-- Boost columns on market_items
ALTER TABLE market_items
  ADD COLUMN IF NOT EXISTS boost_type text NOT NULL DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS boost_expires_at timestamptz;
