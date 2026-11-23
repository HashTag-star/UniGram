-- 066: server pieces for the client features added with the audit fixes.
-- RPCs the client tries first (it falls back to old behaviour if missing)
create or replace function public.mark_messages_read(p_conversation_id uuid)
returns void language sql security definer set search_path = public as $$
  update messages set is_read = true
    where conversation_id = p_conversation_id and sender_id <> auth.uid() and is_read = false
      and exists (select 1 from conversation_participants cp where cp.conversation_id = p_conversation_id and cp.user_id = auth.uid());
  update conversation_participants set unread_count = 0
    where conversation_id = p_conversation_id and user_id = auth.uid();
$$;
grant execute on function public.mark_messages_read(uuid) to authenticated;

create or replace function public.increment_reel_views(p_reel_id uuid)
returns void language sql security definer set search_path = public as $$
  update reels set views_count = coalesce(views_count,0) + 1 where id = p_reel_id; $$;
grant execute on function public.increment_reel_views(uuid) to authenticated;

create or replace function public.increment_market_views(p_item_id uuid)
returns void language sql security definer set search_path = public as $$
  update market_items set views_count = coalesce(views_count,0) + 1 where id = p_item_id; $$;
grant execute on function public.increment_market_views(uuid) to authenticated;

create index if not exists idx_reels_created on reels(created_at desc);
create index if not exists idx_follows_follower_created on follows(follower_id, created_at desc);

-- Mute
create table if not exists public.muted_users(
  user_id uuid references auth.users on delete cascade,
  muted_id uuid references auth.users on delete cascade,
  created_at timestamptz default now(),
  primary key(user_id, muted_id));
alter table public.muted_users enable row level security;
drop policy if exists "own mutes" on public.muted_users;
create policy "own mutes" on public.muted_users for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Follow requests (private accounts)
create table if not exists public.follow_requests(
  requester_id uuid references auth.users on delete cascade,
  target_id uuid references auth.users on delete cascade,
  status text not null default 'pending' check (status in ('pending','approved','denied')),
  created_at timestamptz default now(),
  primary key(requester_id, target_id));
alter table public.follow_requests enable row level security;
drop policy if exists "requester inserts" on public.follow_requests;
drop policy if exists "parties read" on public.follow_requests;
drop policy if exists "requester cancels" on public.follow_requests;
drop policy if exists "target decides" on public.follow_requests;
create policy "requester inserts" on public.follow_requests for insert with check (requester_id = auth.uid() and status = 'pending');
create policy "parties read" on public.follow_requests for select using (requester_id = auth.uid() or target_id = auth.uid());
create policy "requester cancels" on public.follow_requests for delete using (requester_id = auth.uid());
create policy "target decides" on public.follow_requests for update using (target_id = auth.uid()) with check (target_id = auth.uid() and status in ('approved','denied'));

create or replace function public.approve_follow_request(p_requester uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  update follow_requests set status='approved' where requester_id=p_requester and target_id=auth.uid();
  if not found then raise exception 'no such request'; end if;
  insert into follows(follower_id, following_id) values (p_requester, auth.uid()) on conflict do nothing;
end $$;
grant execute on function public.approve_follow_request(uuid) to authenticated;

-- A private account can only be followed through an approved request.
create or replace function public.fn_block_private_follow() returns trigger
language plpgsql security invoker set search_path = public as $$
begin
  if current_user in ('authenticated','anon')
     and exists (select 1 from profiles p where p.id = NEW.following_id and coalesce(p.is_private,false))
     and not exists (select 1 from follow_requests r where r.requester_id = NEW.follower_id
                     and r.target_id = NEW.following_id and r.status = 'approved') then
    raise exception 'This account is private. Send a follow request instead.';
  end if;
  return NEW;
end $$;
drop trigger if exists trg_block_private_follow on public.follows;
create trigger trg_block_private_follow before insert on public.follows
  for each row execute function public.fn_block_private_follow();

-- Events
create table if not exists public.events(
  id uuid primary key default gen_random_uuid(),
  creator_id uuid references auth.users on delete cascade not null,
  title text not null check (char_length(title) between 2 and 120),
  description text check (description is null or char_length(description) <= 1000),
  location text, starts_at timestamptz not null, image_url text, university text,
  created_at timestamptz default now());
alter table public.events enable row level security;
drop policy if exists "read events" on public.events;
drop policy if exists "create own events" on public.events;
drop policy if exists "edit own events" on public.events;
drop policy if exists "delete own events" on public.events;
create policy "read events" on public.events for select using (auth.role() = 'authenticated');
create policy "create own events" on public.events for insert with check (creator_id = auth.uid());
create policy "edit own events" on public.events for update using (creator_id = auth.uid());
create policy "delete own events" on public.events for delete using (creator_id = auth.uid());
create table if not exists public.event_rsvps(
  event_id uuid references public.events on delete cascade,
  user_id uuid references auth.users on delete cascade,
  status text not null check (status in ('going','interested')),
  created_at timestamptz default now(),
  primary key(event_id, user_id));
alter table public.event_rsvps enable row level security;
drop policy if exists "read rsvps" on public.event_rsvps;
drop policy if exists "own rsvp" on public.event_rsvps;
create policy "read rsvps" on public.event_rsvps for select using (auth.role() = 'authenticated');
create policy "own rsvp" on public.event_rsvps for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Confessions
create table if not exists public.confessions(
  id uuid primary key default gen_random_uuid(),
  author_id uuid references auth.users on delete cascade not null,
  body text not null check (char_length(body) between 5 and 500),
  university text, created_at timestamptz default now());
alter table public.confessions enable row level security;
drop policy if exists "read confessions" on public.confessions;
drop policy if exists "post own confession" on public.confessions;
drop policy if exists "delete own confession" on public.confessions;
create policy "read confessions" on public.confessions for select using (auth.role() = 'authenticated');
create policy "post own confession" on public.confessions for insert with check (author_id = auth.uid());
create policy "delete own confession" on public.confessions for delete using (author_id = auth.uid());
create table if not exists public.confession_likes(
  confession_id uuid references public.confessions on delete cascade,
  user_id uuid references auth.users on delete cascade,
  primary key(confession_id, user_id));
alter table public.confession_likes enable row level security;
drop policy if exists "read likes" on public.confession_likes;
drop policy if exists "own like" on public.confession_likes;
create policy "read likes" on public.confession_likes for select using (auth.role() = 'authenticated');
create policy "own like" on public.confession_likes for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Reports: client sends more target types (comment, story, live, message, confession)
alter table if exists public.reports drop constraint if exists reports_target_type_check;
