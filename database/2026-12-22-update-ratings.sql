-- =========================================================
-- Byome: changing your rating in a review update.
--
-- When members add an update to a review, they can also give it a new
-- rating (optional). The review's rating becomes the newest rating from its
-- updates, and that's the rating that counts everywhere: the product's
-- average, its leaf counts, the product pages and so on. The review keeps
-- its first rating in original_rating, shown small as "Originally".
--   - Only updates that are showing count: a held update's rating counts
--     once a moderator approves it.
--   - Deleting an update puts the rating back to the newest one left, or
--     to the original rating if none are left.
--   - Holy grail needs 5 leaves, so it's taken off if the rating drops.
--   - Once a rating has been changed by an update, the review's own rating
--     can't be edited directly any more (it would be overwritten by the
--     updates); a new update changes it instead.
--
-- Run in the Supabase SQL Editor BEFORE merging the site update that came
-- with it (the pages ask for the new columns). Safe to run again. Paste the
-- whole file with nothing highlighted.
-- =========================================================

alter table public.review_updates add column if not exists rating integer;
alter table public.review_updates drop constraint if exists review_updates_rating_check;
alter table public.review_updates add constraint review_updates_rating_check check (rating is null or rating between 1 and 5);

alter table public.reviews add column if not exists original_rating integer;
alter table public.reviews drop constraint if exists reviews_original_rating_check;
alter table public.reviews add constraint reviews_original_rating_check check (original_rating is null or original_rating between 1 and 5);

-- Works out a review's rating from its updates
create or replace function public.review_rating_from_updates(p_review uuid) returns void
language plpgsql security definer set search_path to public as $$
declare
  latest integer;
  r reviews%rowtype;
begin
  select * into r from reviews where id = p_review;
  if not found then return; end if;  -- the review itself is being deleted
  select u.rating into latest from review_updates u
  where u.review_id = p_review and u.rating is not null and u.held_at is null
  order by u.created_at desc limit 1;

  perform set_config('byome.rerating', 'on', true);
  if latest is not null then
    update reviews set
      original_rating = coalesce(original_rating, rating),
      rating = latest,
      holy_grail = holy_grail and latest = 5
    where id = p_review
      and (rating is distinct from latest or original_rating is null);
  elsif r.original_rating is not null then
    update reviews set rating = original_rating, original_rating = null
    where id = p_review;
  end if;
  perform set_config('byome.rerating', 'off', true);
end $$;
revoke execute on function public.review_rating_from_updates(uuid) from public, anon, authenticated;

create or replace function public.review_update_rating_changed() returns trigger
language plpgsql security definer set search_path to public as $$
begin
  if tg_op = 'DELETE' then
    if old.rating is not null then perform review_rating_from_updates(old.review_id); end if;
    return old;
  end if;
  if new.rating is not null or (tg_op = 'UPDATE' and old.rating is not null) then
    perform review_rating_from_updates(new.review_id);
  end if;
  return new;
end $$;

drop trigger if exists review_update_rating on public.review_updates;
create trigger review_update_rating
  after insert or delete or update of rating, held_at on public.review_updates
  for each row execute function public.review_update_rating_changed();

-- An update's rating is set when it's posted, not changed afterwards
create or replace function public.lock_review_update_rating() returns trigger
language plpgsql set search_path to public as $$
begin
  if new.rating is distinct from old.rating then
    raise exception 'An update''s rating can''t be changed. Add a new update instead.';
  end if;
  return new;
end $$;
drop trigger if exists review_updates_lock_rating on public.review_updates;
create trigger review_updates_lock_rating before update of rating on public.review_updates
  for each row execute function public.lock_review_update_rating();

-- Only the updates change original_rating, and once updates have changed
-- the rating, only they can change it again
create or replace function public.guard_review_rating() returns trigger
language plpgsql set search_path to public as $$
begin
  if coalesce(current_setting('byome.rerating', true), '') = 'on' then return new; end if;
  if tg_op = 'INSERT' then
    new.original_rating := null;
    return new;
  end if;
  if new.original_rating is distinct from old.original_rating
     or (old.original_rating is not null and new.rating is distinct from old.rating) then
    raise exception 'Your rating comes from your latest update. To change it, add a new update with a new rating.';
  end if;
  return new;
end $$;
drop trigger if exists reviews_guard_rating on public.reviews;
create trigger reviews_guard_rating before insert or update on public.reviews
  for each row execute function public.guard_review_rating();

-- Tell the API about the new columns straight away
notify pgrst, 'reload schema';
