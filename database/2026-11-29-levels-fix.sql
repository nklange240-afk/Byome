-- =========================================================
-- Byome: URGENT FIX for 2026-11-28-levels.sql.
-- After the levels update, new reviews, likes, comments, poll votes and
-- "helpful" marks failed with: record "new" has no field "suggested_by".
-- This replaces the one function that caused it. Nothing else changes.
-- Run in the Supabase SQL Editor. Safe to run again. Paste the whole file
-- with nothing highlighted.
-- =========================================================

create or replace function public.level_after_change() returns trigger
language plpgsql security definer set search_path to public as $$
declare
  r jsonb := to_jsonb(new);  -- (each table has different columns, so read them by name)
  who uuid;
begin
  if tg_table_name = 'reviews' then who := (r->>'user_id')::uuid;
  elsif tg_table_name = 'products' then who := (r->>'suggested_by')::uuid;
  elsif tg_table_name in ('likes', 'comments', 'poll_votes') then
    select user_id into who from posts where id = (r->>'post_id')::uuid;
  elsif tg_table_name in ('review_standouts', 'review_likes') then
    select user_id into who from reviews where id = (r->>'review_id')::uuid;
  end if;
  if who is not null then perform refresh_level(who); end if;
  return null;
end $$;
