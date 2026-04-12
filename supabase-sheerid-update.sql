-- Adding sheerid_verified column to verification_requests
ALTER TABLE public.verification_requests 
ADD COLUMN IF NOT EXISTS sheerid_verified BOOLEAN DEFAULT false;
