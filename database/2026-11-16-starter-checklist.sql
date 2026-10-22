-- =========================================================
-- Byome: bios, the starter checklist, and achievement pop-ups that only
-- show once per account.
--  - Bios: a short line about yourself (up to 160 characters) on your
--    profile. No links; words the automod holds aren't allowed. Moderators
--    can remove a reported bio (the member is told why).
--  - Starter checklist: five first steps for new members, shown on the
--    homepage (find your shelf, add a picture or bio, write a review, post
--    or comment, peek in the Byome Shop). Finishing all five earns
--    "Settled In" and 15 Byome points. It shows for accounts made from now
--    on, and for older accounts that haven't posted, commented or reviewed
--    yet; members can hide it.
--  - Achievement pop-ups are remembered on the account, not the device, so
--    each one shows once (not again on a new device or a new session).
-- Run in the Supabase SQL Editor. Safe to run again. Paste the whole file
-- with nothing highlighted. Needs 2026-11-13-hidden-achievements.sql first.
-- =========================================================

-- ---------- Bios ----------
alter table public.profiles add column if not exists bio text;
alter table public.profiles drop constraint if exists profiles_bio_check;
alter table public.profiles add constraint profiles_bio_check check (char_length(bio) <= 160);

-- Set (or clear, with an empty bio) your own bio.
-- Returns 'ok', 'too_long', 'no_links' or 'not_allowed'.
create or replace function public.set_my_bio(p_bio text) returns text
language plpgsql security definer set search_path to public as $$
declare
  me uuid := auth.uid();
  clean text;
begin
  if me is null then raise exception 'Please log in first'; end if;
  -- trim, and no more than one blank line in a row
  clean := nullif(btrim(regexp_replace(coalesce(p_bio, ''), '\n\s*\n(\s*\n)+', E'\n\n', 'g')), '');
  if char_length(clean) > 160 then return 'too_long'; end if;
  if clean ~* '(https?://|www\.|\.(com|net|org|co|io|ly|xyz|shop|link)\M)' then return 'no_links'; end if;
  if clean is not null and text_is_flagged(clean) then return 'not_allowed'; end if;
  update profiles set bio = clean where id = me;
  return 'ok';
end $$;
revoke execute on function public.set_my_bio(text) from public, anon;
grant execute on function public.set_my_bio(text) to authenticated;

-- A deleted account's bio goes with it
create or replace function public.clear_deleted_bio() returns trigger
language plpgsql as $$
begin
  if new.deleted_at is not null then new.bio := null; end if;
  return new;
end $$;
drop trigger if exists profiles_clear_deleted_bio on public.profiles;
create trigger profiles_clear_deleted_bio before update of deleted_at on public.profiles
for each row execute function public.clear_deleted_bio();

-- Moderators: same as before, plus removing a bio
create or replace function public.moderate_profile(p_id uuid, p_action text)
returns text
language plpgsql security definer set search_path to public as $$
declare msg text; old_name text;
begin
  if not is_moderator() then raise exception 'Moderators only'; end if;
  select username into old_name from profiles where id = p_id;

  if p_action = 'remove_avatar' then
    update profiles set avatar_path = null where id = p_id;
    msg := 'A moderator removed your profile picture because it didn''t follow the community guidelines. You can upload a new one on Edit profile.';
  elsif p_action = 'reset_username' then
    update profiles set username = 'member-' || right(replace(p_id::text, '-', ''), 12) where id = p_id;
    msg := 'A moderator reset your username because it didn''t follow the community guidelines. Please choose a new one on Edit profile.';
  elsif p_action = 'remove_bio' then
    update profiles set bio = null where id = p_id;
    msg := 'A moderator removed your bio because it didn''t follow the community guidelines. You can write a new one on Edit profile.';
  else
    raise exception 'Unknown action: %', p_action;
  end if;

  update content_reports set resolved_at = now(), resolved_by = null, resolution = 'actioned'
  where profile_id = p_id and resolved_at is null;
  perform create_notification(p_id, null, 'moderation', p_id, msg, 'edit-profile.html', false, 'negative');
  perform log_moderation(p_action, 'profile', p_id, p_id, 'negative', old_name);
  perform reward_moderator('mod_decision', 'profile', p_id, p_id);
  return 'done';
end $$;


-- ---------- Starter checklist ----------
insert into public.achievements (key, name, description, event_points, sort_order) values
  ('settled-in', 'Settled In', 'Finished the Byome starter checklist. Make yourself at home!', 15, 2)
on conflict (key) do update set
  name = excluded.name, description = excluded.description, event_points = excluded.event_points;

-- Steps the database can't see by itself ('shelf': opened Arrange on your
-- shelf) and hiding the checklist ('hidden')
create table if not exists public.starter_steps (
  user_id uuid not null references public.profiles(id) on delete cascade,
  step text not null check (step in ('shelf', 'hidden')),
  done_at timestamptz not null default now(),
  primary key (user_id, step)
);
alter table public.starter_steps enable row level security;
revoke all on public.starter_steps from anon, authenticated;

-- When the checklist arrived: accounts made from then on always get it
create table if not exists public.starter_settings (
  id boolean primary key default true check (id),
  launched_at timestamptz not null default now()
);
insert into public.starter_settings (id) values (true) on conflict do nothing;
revoke all on public.starter_settings from anon, authenticated;

create or replace function public.mark_starter_step(p_step text) returns void
language plpgsql security definer set search_path to public as $$
declare me uuid := auth.uid();
begin
  if me is null then return; end if;
  if p_step not in ('shelf', 'hidden') then raise exception 'Unknown step: %', p_step; end if;
  insert into starter_steps (user_id, step) values (me, p_step) on conflict do nothing;
end $$;
revoke execute on function public.mark_starter_step(text) from public, anon;
grant execute on function public.mark_starter_step(text) to authenticated;

-- Your checklist: whether to show it, and which steps are done. When all
-- five are done, this also gives "Settled In" and its points (once).
create or replace function public.my_starter_checklist() returns jsonb
language plpgsql security definer set search_path to public as $$
declare
  me uuid := auth.uid();
  p profiles%rowtype;
  s jsonb;
  all_done boolean;
  finished boolean;
begin
  if me is null then return jsonb_build_object('show', false); end if;
  select * into p from profiles where id = me;
  if not found or p.deleted_at is not null then return jsonb_build_object('show', false); end if;

  s := jsonb_build_object(
    'shelf',   exists (select 1 from starter_steps where user_id = me and step = 'shelf'),
    'profile', p.avatar_path is not null or coalesce(p.bio, '') <> '',
    'review',  exists (select 1 from reviews where user_id = me),
    'post',    exists (select 1 from posts where user_id = me) or exists (select 1 from comments where user_id = me),
    'shop',    exists (select 1 from shop_visits where user_id = me));
  all_done := (s->>'shelf')::boolean and (s->>'profile')::boolean and (s->>'review')::boolean
              and (s->>'post')::boolean and (s->>'shop')::boolean;

  finished := exists (select 1 from user_achievements where user_id = me and achievement_key = 'settled-in');
  if all_done and not finished then
    perform grant_hidden_achievement(me, 'settled-in');
    finished := true;
    return jsonb_build_object('show', true, 'steps', s, 'just_finished', true);
  end if;
  if finished then return jsonb_build_object('show', false); end if;

  -- members who were already posting before the checklist don't need it
  if exists (select 1 from starter_steps where user_id = me and step = 'hidden')
     or (coalesce(p.created_at, now()) < (select launched_at from starter_settings)
         and (exists (select 1 from posts where user_id = me)
              or exists (select 1 from comments where user_id = me)
              or exists (select 1 from reviews where user_id = me))
         and not exists (select 1 from starter_steps where user_id = me))
  then
    return jsonb_build_object('show', false);
  end if;
  return jsonb_build_object('show', true, 'steps', s);
end $$;
revoke execute on function public.my_starter_checklist() from public, anon;
grant execute on function public.my_starter_checklist() to authenticated;


-- ---------- Achievement pop-ups: once per account ----------
alter table public.user_achievements add column if not exists celebrated_at timestamptz;
-- Ones earned before today were shown already (on some device); anything
-- from the last hour still gets its pop-up
update public.user_achievements set celebrated_at = now()
where celebrated_at is null and earned_at < now() - interval '1 hour';

create or replace function public.mark_achievements_celebrated(p_keys text[]) returns void
language plpgsql security definer set search_path to public as $$
begin
  if auth.uid() is null then return; end if;
  update user_achievements set celebrated_at = now()
  where user_id = auth.uid() and achievement_key = any(p_keys) and celebrated_at is null;
end $$;
revoke execute on function public.mark_achievements_celebrated(text[]) from public, anon;
grant execute on function public.mark_achievements_celebrated(text[]) to authenticated;
