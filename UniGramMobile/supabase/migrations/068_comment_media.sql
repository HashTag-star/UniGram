-- 068: images / memes / GIFs in comments (and AI image replies).
alter table public.post_comments  add column if not exists media_url  text;
alter table public.post_comments  add column if not exists media_type text check (media_type is null or media_type in ('image','gif','sticker'));
alter table public.reel_comments  add column if not exists media_url  text;
alter table public.reel_comments  add column if not exists media_type text check (media_type is null or media_type in ('image','gif','sticker'));

-- Only our own storage may be linked (no tracking pixels / hotlinked junk).
alter table public.post_comments drop constraint if exists post_comments_media_url_chk;
alter table public.post_comments add constraint post_comments_media_url_chk
  check (media_url is null or media_url like 'https://%') not valid;
alter table public.reel_comments drop constraint if exists reel_comments_media_url_chk;
alter table public.reel_comments add constraint reel_comments_media_url_chk
  check (media_url is null or media_url like 'https://%') not valid;
