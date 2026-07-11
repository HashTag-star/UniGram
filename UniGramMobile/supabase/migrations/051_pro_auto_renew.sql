-- 051_pro_auto_renew.sql
-- Add pro_auto_renew column to profiles to support auto-billing settings for Pro subscriptions.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS pro_auto_renew boolean NOT NULL DEFAULT true;
