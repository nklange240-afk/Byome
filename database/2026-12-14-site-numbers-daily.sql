-- =========================================================
-- Byome: day by day on the Site numbers page.
--
-- A "Day by day" table for the last 14 days (Central time, today first):
-- active members, who joined, reviews, posts and polls, and comments. The
-- page's new "Today" button needs nothing from the database; this is for
-- the table. Only people with the site_numbers permission can see it.
--
-- Needs 2026-12-03-site-numbers.sql first. Safe to run again. Paste the
-- whole file with nothing highlighted. Can run any time.
-- =========================================================

create or replace function public.site_numbers_daily(p_days integer default 14) returns jsonb
language plpgsql stable security definer set search_path to public as $$
declare
  today date := byome_today();
  first_day date := byome_today() - (greatest(1, least(coalesce(p_days, 14), 60)) - 1);
  result jsonb;
begin
  if not has_permission('site_numbers') then raise exception 'You don''t have access to the site numbers'; end if;

  -- Every member action with its day (the same list as the rest of the page)
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
    where user_id is not null and day >= first_day
  )
  select coalesce(jsonb_agg(jsonb_build_object(
      'day', d.day,
      'active', (select count(distinct user_id) from act where act.day = d.day),
      'new', (select count(*) from profiles where central_day(created_at) = d.day),
      'reviews', (select count(*) from reviews where central_day(created_at) = d.day),
      'posts', (select count(*) from posts where central_day(created_at) = d.day),
      'comments', (select count(*) from comments where central_day(created_at) = d.day))
    order by d.day desc), '[]'::jsonb)
  into result
  from (select generate_series(first_day, today, interval '1 day')::date as day) d;
  return result;
end $$;
revoke execute on function public.site_numbers_daily(integer) from public, anon;
grant execute on function public.site_numbers_daily(integer) to authenticated;

-- Tell the API about the new function straight away
notify pgrst, 'reload schema';
