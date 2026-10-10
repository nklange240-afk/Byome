-- =========================================================
-- byome: "Helpful" on reviews, and sorting reviews by most helpful.
-- The leaf button on reviews now reads "Helpful"; each review keeps a
-- running count so the Reviews page can sort by it.
-- Run in the Supabase SQL Editor (after 2026-10-10-profile-biomes.sql).
-- Safe to run again. Paste the whole file with nothing highlighted.
-- =========================================================

alter table public.reviews add column if not exists helpful_count integer not null default 0;

-- Count what's already there
update public.reviews r
set helpful_count = (select count(*) from public.review_likes l where l.review_id = r.id);

create index if not exists reviews_helpful_idx on public.reviews (helpful_count desc, created_at desc);

-- Keep the count up to date as people mark reviews helpful (or take it back)
create or replace function public.count_review_helpful() returns trigger
language plpgsql security definer set search_path to public as $$
begin
  perform set_config('byome.counting', 'on', true);
  if tg_op = 'INSERT' then
    update reviews set helpful_count = helpful_count + 1 where id = new.review_id;
  else
    update reviews set helpful_count = greatest(helpful_count - 1, 0) where id = old.review_id;
  end if;
  perform set_config('byome.counting', 'off', true);
  return null;
end $$;
revoke execute on function public.count_review_helpful() from public, anon, authenticated;

drop trigger if exists review_likes_count on public.review_likes;
create trigger review_likes_count after insert or delete on public.review_likes
  for each row execute function public.count_review_helpful();

-- Members can edit their own reviews, but not their helpful count. Same
-- as before, plus that one rule.
create or replace function public.lock_review_fields() returns trigger
language plpgsql set search_path to public as $$
begin
  if new.product_id is distinct from old.product_id
     or new.user_id is distinct from old.user_id
     or new.created_at is distinct from old.created_at
     or (new.helpful_count is distinct from old.helpful_count
         and coalesce(current_setting('byome.counting', true), '') <> 'on') then
    raise exception 'That part of a review can''t be changed';
  end if;
  return new;
end $$;
