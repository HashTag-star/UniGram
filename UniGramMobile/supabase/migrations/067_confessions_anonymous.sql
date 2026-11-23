-- 067: confessions stay anonymous. Clients can no longer read author_id or who liked what.
revoke select on public.confessions from authenticated, anon;
grant select (id, body, university, created_at) on public.confessions to authenticated;


create or replace function public.get_confessions(p_university text default null, p_limit int default 60)
returns table(id uuid, body text, university text, created_at timestamptz,
              like_count bigint, liked_by_me boolean, mine boolean)
language sql stable security definer set search_path = public as $$
  select c.id, c.body, c.university, c.created_at,
         (select count(*) from confession_likes l where l.confession_id = c.id) as like_count,
         exists (select 1 from confession_likes l where l.confession_id = c.id and l.user_id = auth.uid()) as liked_by_me,
         (c.author_id = auth.uid()) as mine
  from confessions c
  where auth.uid() is not null
    and (p_university is null or c.university = p_university or c.university is null)
  order by c.created_at desc
  limit least(coalesce(p_limit, 60), 100);
$$;
revoke execute on function public.get_confessions(text, int) from public, anon;
grant execute on function public.get_confessions(text, int) to authenticated;
