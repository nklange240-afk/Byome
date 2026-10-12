-- =========================================================
-- Byome: badges, and no points for held content until it's approved.
--  1. Badges: moderators show a "Mod" badge by their name (from
--     is_moderator). A profile can also have a special badge, for now
--     only 'founder', which shows instead. Badges are set here in the
--     SQL Editor, never by members themselves.
--  2. Reviews and review updates that automod holds for a moderator no
--     longer earn points straight away. They earn them when a moderator
--     approves them (and never, if they're removed). This matters now
--     that Byome points can be spent right away.
-- Run in the Supabase SQL Editor AFTER
-- 2026-10-14-byome-points-right-away.sql. Safe to run again. Paste the
-- whole file with nothing highlighted.
--
-- To give your own account the Founder badge (replace the username):
--   update public.profiles set badge = 'founder'
--   where lower(username) = lower('your-username')
--   returning username, badge;
-- =========================================================


-- ---------- 1. Badges ----------
alter table public.profiles add column if not exists badge text;
alter table public.profiles drop constraint if exists profiles_badge_check;
alter table public.profiles add constraint profiles_badge_check check (badge in ('founder'));
-- Members can't change their own profile row directly (profiles have no
-- update policy; edits go through checked functions), so badges can only
-- be set from the SQL Editor.


-- ---------- 2. Points wait for approval ----------
-- A new review: same as before, except a held review earns nothing yet.
-- The trigger now also runs when a moderator approves it (held_at
-- cleared), which is when it earns its points.
create or replace function public.handle_review_points() returns trigger
language plpgsql security definer set search_path to public as $$
declare rule point_rules%rowtype; dup boolean; first_one boolean;
begin
  if new.held_at is not null then return new; end if;  -- waiting for a moderator
  select * into rule from point_rules where action = 'review';
  if not found then return new; end if;

  if review_is_quality(new.body, coalesce(rule.min_chars, 0)) then
    select exists (
      select 1 from point_ledger l join reviews r2 on r2.id = l.ref_id
      where l.user_id = new.user_id and l.action = 'review' and l.ref_type = 'review'
        and l.revoked_at is null and r2.product_id = new.product_id and r2.id <> new.id
    ) into dup;

    if not dup then
      if award_points(new.user_id, 'review', 'review', new.id) then
        select not exists (
          select 1 from reviews r2
          where r2.product_id = new.product_id and r2.id <> new.id and r2.created_at < new.created_at
        ) into first_one;
        if first_one then perform award_points(new.user_id, 'first_review', 'review', new.id); end if;
      end if;
    end if;
  else
    update point_ledger set revoked_at = now()
    where ref_type = 'review' and ref_id = new.id and revoked_at is null
      and action in ('review', 'first_review', 'review_liked', 'review_update', 'review_standout');
  end if;
  return new;
end $$;

drop trigger if exists reviews_points on public.reviews;
create trigger reviews_points after insert or update of body, held_at on public.reviews
  for each row execute function public.handle_review_points();

-- A review update: same as before, except a held one earns nothing until
-- a moderator approves it
create or replace function public.on_review_update_added() returns trigger
language plpgsql security definer set search_path to public as $$
declare rule point_rules%rowtype;
begin
  if new.held_at is not null then return new; end if;  -- waiting for a moderator
  select * into rule from point_rules where action = 'review_update';
  if not found then return new; end if;
  if char_length(trim(new.body)) < coalesce(rule.min_chars, 0) then return new; end if;
  if new.body ~ '(.)\1{9,}' then return new; end if;   -- keyboard-mashing
  if not exists (select 1 from point_ledger
                 where action = 'review' and ref_type = 'review' and ref_id = new.review_id and revoked_at is null) then
    return new;
  end if;
  perform award_points(new.user_id, 'review_update', 'review', new.review_id);   -- once per review
  return new;
end $$;

drop trigger if exists review_updates_points on public.review_updates;
create trigger review_updates_points after insert or update of held_at on public.review_updates
  for each row execute function public.on_review_update_added();
