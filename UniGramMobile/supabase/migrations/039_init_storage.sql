-- Ensure all required storage buckets exist and are public
-- This migration ensures that buckets used in the application are initialized
-- with correct public/private settings.

INSERT INTO storage.buckets (id, name, public)
VALUES 
  ('ad-media', 'ad-media', true),
  ('post-media', 'post-media', true),
  ('videos', 'videos', true),
  ('avatars', 'avatars', true),
  ('market-images', 'market-images', true),
  ('verifications', 'verifications', false),
  ('reel-thumbnails', 'reel-thumbnails', true)
ON CONFLICT (id) DO UPDATE SET public = EXCLUDED.public;

-- ─── STORAGE POLICIES ────────────────────────────────────────────────────────

-- 1. ad-media
DROP POLICY IF EXISTS "ad_media_public_read" ON storage.objects;
CREATE POLICY "ad_media_public_read" ON storage.objects FOR SELECT USING (bucket_id = 'ad-media');

DROP POLICY IF EXISTS "ad_media_auth_insert" ON storage.objects;
CREATE POLICY "ad_media_auth_insert" ON storage.objects FOR INSERT WITH CHECK (
  bucket_id = 'ad-media' AND auth.role() = 'authenticated'
);

DROP POLICY IF EXISTS "ad_media_owner_delete" ON storage.objects;
CREATE POLICY "ad_media_owner_delete" ON storage.objects FOR DELETE USING (
  bucket_id = 'ad-media' AND (storage.foldername(name))[2] = auth.uid()::text
);

-- 2. post-media
DROP POLICY IF EXISTS "post_media_public_read" ON storage.objects;
CREATE POLICY "post_media_public_read" ON storage.objects FOR SELECT USING (bucket_id = 'post-media');

DROP POLICY IF EXISTS "post_media_auth_insert" ON storage.objects;
CREATE POLICY "post_media_auth_insert" ON storage.objects FOR INSERT WITH CHECK (
  bucket_id = 'post-media' AND auth.role() = 'authenticated'
);

DROP POLICY IF EXISTS "post_media_owner_delete" ON storage.objects;
CREATE POLICY "post_media_owner_delete" ON storage.objects FOR DELETE USING (
  bucket_id = 'post-media' AND (storage.foldername(name))[1] = auth.uid()::text
);

-- 3. videos
DROP POLICY IF EXISTS "videos_public_read" ON storage.objects;
CREATE POLICY "videos_public_read" ON storage.objects FOR SELECT USING (bucket_id = 'videos');

DROP POLICY IF EXISTS "videos_auth_insert" ON storage.objects;
CREATE POLICY "videos_auth_insert" ON storage.objects FOR INSERT WITH CHECK (
  bucket_id = 'videos' AND auth.role() = 'authenticated'
);

DROP POLICY IF EXISTS "videos_owner_delete" ON storage.objects;
CREATE POLICY "videos_owner_delete" ON storage.objects FOR DELETE USING (
  bucket_id = 'videos' AND (storage.foldername(name))[1] = auth.uid()::text
);

-- 4. avatars
DROP POLICY IF EXISTS "avatars_public_read" ON storage.objects;
CREATE POLICY "avatars_public_read" ON storage.objects FOR SELECT USING (bucket_id = 'avatars');

DROP POLICY IF EXISTS "avatars_auth_insert" ON storage.objects;
CREATE POLICY "avatars_auth_insert" ON storage.objects FOR INSERT WITH CHECK (
  bucket_id = 'avatars' AND auth.role() = 'authenticated'
);

DROP POLICY IF EXISTS "avatars_owner_delete" ON storage.objects;
CREATE POLICY "avatars_owner_delete" ON storage.objects FOR DELETE USING (
  bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text
);

-- 5. market-images
DROP POLICY IF EXISTS "market_images_public_read" ON storage.objects;
CREATE POLICY "market_images_public_read" ON storage.objects FOR SELECT USING (bucket_id = 'market-images');

DROP POLICY IF EXISTS "market_images_auth_insert" ON storage.objects;
CREATE POLICY "market_images_auth_insert" ON storage.objects FOR INSERT WITH CHECK (
  bucket_id = 'market-images' AND auth.role() = 'authenticated'
);

DROP POLICY IF EXISTS "market_images_owner_delete" ON storage.objects;
CREATE POLICY "market_images_owner_delete" ON storage.objects FOR DELETE USING (
  bucket_id = 'market-images' AND (storage.foldername(name))[1] = auth.uid()::text
);

-- 6. verifications (Private)
DROP POLICY IF EXISTS "verifications_admin_read" ON storage.objects;
CREATE POLICY "verifications_admin_read" ON storage.objects FOR SELECT USING (
  bucket_id = 'verifications' AND (
    (SELECT is_admin FROM public.profiles WHERE id = auth.uid()) = true
    OR (storage.foldername(name))[1] = auth.uid()::text
  )
);

DROP POLICY IF EXISTS "verifications_auth_insert" ON storage.objects;
CREATE POLICY "verifications_auth_insert" ON storage.objects FOR INSERT WITH CHECK (
  bucket_id = 'verifications' AND auth.role() = 'authenticated'
);

-- 7. reel-thumbnails
DROP POLICY IF EXISTS "reel_thumbnails_public_read" ON storage.objects;
CREATE POLICY "reel_thumbnails_public_read" ON storage.objects FOR SELECT USING (bucket_id = 'reel-thumbnails');

DROP POLICY IF EXISTS "reel_thumbnails_auth_insert" ON storage.objects;
CREATE POLICY "reel_thumbnails_auth_insert" ON storage.objects FOR INSERT WITH CHECK (
  bucket_id = 'reel-thumbnails' AND auth.role() = 'authenticated'
);

DROP POLICY IF EXISTS "reel_thumbnails_owner_delete" ON storage.objects;
CREATE POLICY "reel_thumbnails_owner_delete" ON storage.objects FOR DELETE USING (
  bucket_id = 'reel-thumbnails' AND (storage.foldername(name))[1] = auth.uid()::text
);
