-- =========================================================
-- Byome: the "Site numbers" page (site-numbers.html), which replaces the
-- Shop signs page and keeps it as one section. For people given access.
--
-- Everything here is worked out from what Byome already stores; nothing
-- new is tracked. Days and weeks are in Central time; weeks start Monday.
--   Active members   different members who did anything that day or
--                    week: posted, commented, reviewed, added a review
--                    update, liked, marked something helpful, voted in a
--                    poll, opened the daily surprise, suggested a product
--                    or shade, or visited the shop. (Just reading isn't
--                    recorded, so it's a slight undercount.)
--   New members      accounts created
--   Settling in      of each week's new members: who wrote a review within
--                    7 days of joining, and who was active the next week
--                    and the week after
--   Activity         reviews, posts and polls, comments, Helpful marks,
--                    and product and shade suggestions
--   Moderation       reports received, how long they waited, moderator
--                    decisions, and what's waiting right now
--   Most reviewed    brands and categories
--
-- Access is now called site_numbers. Everyone who could see the shop sign
-- numbers gets it automatically. To give or take it away:
--   select public.grant_permission('username', 'site_numbers');
--   select public.revoke_permission('username', 'site_numbers');
--
-- Run in the Supabase SQL Editor AFTER 2026-12-02-shop-sign-stats.sql and
-- BEFORE publishing the site update that came with it. Safe to run again.
-- Paste the whole file with nothing highlighted.
-- =========================================================

-- ---------- Access ----------
alter table public.staff_permissions drop constraint if exists staff_permissions_permission_check;
alter table public.staff_permissions add constraint staff_permissions_permission_check
  check (permission in ('sign_stats', 'site_numbers'));

insert into public.staff_permissions (user_id, permission)
select user_id, 'site_numbers' from public.staff_permissions where permission = 'sign_stats'
on conflict do nothing;
insert into public.staff_permissions (user_id, permission)
select id, 'site_numbers' from public.profiles where badge = 'founder'
on conflict do nothing;

-- The shop sign numbers are part of the page now, so either permission works
create or replace function public.sign_stats_report(p_days integer default 30) returns jsonb
language plpgsql stable security definer set search_path to public as $$
declare
  since date := byome_today() - (greatest(1, least(coalesce(p_days, 30), 400)) - 1);
begin
  if not (has_permission('site_numbers') or has_permission('sign_stats')) then
    raise exception 'You don''t have access to the site numbers';
  end if;
  return jsonb_build_object(
    'since', since,
    'today', byome_today(),
    'signs', coalesce((select jsonb_agg(jsonb_build_object(
        'key', s.key, 'name', s.name, 'kind', s.kind, 'sponsor', s.sponsor,
        'starts_on', s.starts_on, 'ends_on', s.ends_on) order by s.kind, s.created_at, s.key)
      from shop_signs s), '[]'::jsonb),
    'days', coalesce((select jsonb_agg(jsonb_build_object(
        'day', d.day, 'sign', d.sign, 'views', d.views, 'people', d.people,
        'taps', d.taps, 'tappers', d.tappers) order by d.day desc, d.sign)
      from sign_stats d where d.day >= since), '[]'::jsonb));
end $$;

drop policy if exists "Sign stats viewers can see signs" on public.shop_signs;
create policy "Sign stats viewers can see signs" on public.shop_signs for select to authenticated
  using ((select public.has_permission('site_numbers')) or (select public.has_permission('sign_stats')));


-- ---------- The numbers ----------
-- A Central-time date
create or replace function public.central_day(ts timestamptz) returns date
language sql immutable as $$ select (ts at time zone 'America/Chicago')::date $$;

-- The Monday that starts a date's week
create or replace function public.week_of(d date) returns date
language sql immutable as $$ select (d - (extract(isodow from d)::int - 1)) $$;

create or replace function public.site_numbers_report(p_days integer default 30) returns jsonb
language plpgsql stable security definer set search_path to public as $$
declare
  today date := byome_today();
  since date := byome_today() - (greatest(1, least(coalesce(p_days, 30), 400)) - 1);
  this_week date := week_of(byome_today());
  first_week date := week_of(byome_today()) - 7 * 11;   -- 12 weeks, this one included
  result jsonb;
begin
  if not has_permission('site_numbers') then raise exception 'You don''t have access to the site numbers'; end if;

  -- Every member action with its day (reused by the numbers below)
  with act as materialized (
    select user_id, day from (
      select user_id, central_day(created_at) as day from posts
      union all select user_id, central_day(created_at) from comments
      union all select user_id, central_day(created_at) from reviews
      union all select user_id, central_day(created_at) from review_updates
      union all select user_id, central_day(created_at) from likes
      union all select user_id, central_day(created_at) from comment_likes
      union all select user_id, central_day(created_at) from review_likes
      union all select user_id, central_day(voted_at) from poll_votes
      union all select user_id, day from daily_gifts
      union all select suggested_by, central_day(created_at) from products where suggested_by is not null
      union all select suggested_by, central_day(created_at) from variation_suggestions where suggested_by is not null
      union all select user_id, central_day(hour) from shop_visits
    ) a
    where user_id is not null and day >= least(since, this_week - 7 * 12)
  )
  select jsonb_build_object(
    'since', since,
    'today', today,

    'active', jsonb_build_object(
      'today', (select count(distinct user_id) from act where day = today),
      'week', (select count(distinct user_id) from act where day > today - 7),
      'month', (select count(distinct user_id) from act where day > today - 30),
      'period', (select count(distinct user_id) from act where day >= since)),

    'members', jsonb_build_object(
      'total', (select count(*) from profiles where deleted_at is null),
      'new', (select count(*) from profiles where central_day(created_at) >= since)),

    'activity', jsonb_build_object(
      'reviews', (select count(*) from reviews where central_day(created_at) >= since),
      'posts', (select count(*) from posts where central_day(created_at) >= since),
      'comments', (select count(*) from comments where central_day(created_at) >= since),
      'helpful', (select count(*) from review_likes where central_day(created_at) >= since),
      'suggestions', (select count(*) from products where suggested_by is not null and central_day(created_at) >= since)
                   + (select count(*) from variation_suggestions where central_day(created_at) >= since)),

    'weeks', (select jsonb_agg(jsonb_build_object(
        'week', w,
        'active', (select count(distinct user_id) from act where day >= w and day < w + 7),
        'new', (select count(*) from profiles where central_day(created_at) >= w and central_day(created_at) < w + 7),
        'reviews', (select count(*) from reviews where central_day(created_at) >= w and central_day(created_at) < w + 7),
        'posts', (select count(*) from posts where central_day(created_at) >= w and central_day(created_at) < w + 7),
        'comments', (select count(*) from comments where central_day(created_at) >= w and central_day(created_at) < w + 7))
        order by w desc)
      from generate_series(first_week, this_week, interval '7 days') g(wt), lateral (select wt::date w) x),

    -- Each of the last 8 weeks' new members, and how they settled in
    -- (null where that time hasn't happened yet)
    'cohorts', (select jsonb_agg(jsonb_build_object(
        'week', w, 'joined', joined,
        'reviewed', case when w + 7 > today then null else reviewed end,
        'next_week', case when w + 7 > today then null else next_week end,
        'week_after', case when w + 14 > today then null else week_after end)
        order by w desc)
      from (
        select x.w,
          count(p.id) joined,
          count(p.id) filter (where exists (select 1 from reviews r where r.user_id = p.id
            and r.created_at < p.created_at + interval '7 days')) reviewed,
          count(p.id) filter (where exists (select 1 from act a where a.user_id = p.id
            and a.day >= x.w + 7 and a.day < x.w + 14)) next_week,
          count(p.id) filter (where exists (select 1 from act a where a.user_id = p.id
            and a.day >= x.w + 14 and a.day < x.w + 21)) week_after
        from generate_series(this_week - 7 * 7, this_week, interval '7 days') g(wt)
        cross join lateral (select wt::date w) x
        left join profiles p on central_day(p.created_at) >= x.w and central_day(p.created_at) < x.w + 7
        group by x.w) t),

    'moderation', jsonb_build_object(
      'reports', (select count(*) from content_reports where central_day(created_at) >= since),
      'reports_resolved', (select count(*) from content_reports where resolved_at is not null and central_day(resolved_at) >= since),
      'avg_hours', (select round((extract(epoch from avg(resolved_at - created_at)) / 3600)::numeric, 1)
                    from content_reports where resolved_at is not null and central_day(resolved_at) >= since),
      'decisions', (select count(*) from moderation_log where central_day(created_at) >= since),
      'waiting', (select count(*) from content_reports where resolved_at is null)
               + (select count(*) from posts where held_at is not null)
               + (select count(*) from comments where held_at is not null)
               + (select count(*) from reviews where held_at is not null)
               + (select count(*) from review_updates where held_at is not null)
               + (select count(*) from products where status = 'pending')
               + (select count(*) from variation_suggestions where status = 'pending')),

    'brands', coalesce((select jsonb_agg(b order by (b->>'reviews')::int desc, b->>'brand') from (
        select jsonb_build_object('brand', p.brand, 'reviews', count(*), 'reviewers', count(distinct r.user_id)) b
        from reviews r join products p on p.id = r.product_id
        where central_day(r.created_at) >= since
        group by p.brand order by count(*) desc, p.brand limit 10) t), '[]'::jsonb),

    'categories', coalesce((select jsonb_agg(c order by (c->>'reviews')::int desc) from (
        select jsonb_build_object('category', coalesce(p.category, 'No category'), 'reviews', count(*)) c
        from reviews r join products p on p.id = r.product_id
        where central_day(r.created_at) >= since
        group by p.category) t), '[]'::jsonb)
  ) into result;

  return result;
end $$;
revoke execute on function public.site_numbers_report(integer) from public, anon;
grant execute on function public.site_numbers_report(integer) to authenticated;

-- Check: who can see the site numbers
select p.username, s.permission
from public.staff_permissions s join public.profiles p on p.id = s.user_id
order by s.permission, p.username;
