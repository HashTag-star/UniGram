-- [Kofi Asante - Backend] Pro opt-out: lets a paid Pro user temporarily disable
-- the Pro experience (badge, features) without ending the paid period or
-- triggering a refund. Re-enabling restores Pro until pro_expires_at.
--
-- IMPORTANT: pro_disabled is intentionally NOT in the profiles_privileged_guard
-- trigger's protected column list. Users must be able to toggle this themselves.
-- is_pro and pro_expires_at remain service-role-only — only Paystack webhooks
-- can grant Pro status.

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS pro_disabled boolean NOT NULL DEFAULT false;
