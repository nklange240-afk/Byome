-- =========================================================
-- Byome: old usernames are held for 7 days, and Shape Shifter replaces
-- Wall of Text in Beta Testing: Sugar and Spice.
--
-- USERNAME HOLDS: when a member changes their username, their old one is
-- kept for them for 7 days. Nobody else can take it (or sign up with it)
-- until then, but they can switch back to it any time. After 7 days it's
-- free for anyone. Every past username is kept in username_history, so
-- moderators can look up who used a name before (Table Editor).
--
-- Usernames everywhere else update by themselves: posts, reviews,
-- comments and everything else point to the member, not their name. Two
-- places keep a copy of the name, and both are updated: the beta tester
-- list, and notifications that start with the member's name ("bobby
-- liked your post...").
--
-- SHAPE SHIFTER (Spice): change your username at least once. Wall of
-- Text is taken out; anyone who already finished it keeps their points.
--
-- Needs 2026-12-08-beta-event.sql first. Safe to run again. Paste the
-- whole file with nothing highlighted. Run it before publishing the site
-- update that came with it.
-- =========================================================


-- ---------- Every past username, and its 7-day hold ----------
create table if not exists public.username_history (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  username text not null,
  changed_at timestamptz not null default now(),
  held_until timestamptz not null default now() + interval '7 days'
);
create index if not exists username_history_name_idx on public.username_history (lower(username), held_until);
alter table public.username_history enable row level security;
-- (no policies: only you, in Supabase, can read it)

-- When a username changes: hold the old one, and update the copies
create or replace function public.on_username_changed() returns trigger
language plpgsql security definer set search_path to public as $$
begin
  insert into username_history (user_id, username) values (new.id, old.username);
  -- "bobby liked your post..." now says the new name
  update notifications set message = new.username || substr(message, char_length(old.username) + 1)
  where actor_id = new.id and left(message, char_length(old.username) + 1) = old.username || ' ';
  return null;
end $$;
revoke execute on function public.on_username_changed() from public, anon, authenticated;
drop trigger if exists profiles_username_changed on public.profiles;
create trigger profiles_username_changed after update of username on public.profiles
  for each row when (old.username is distinct from new.username)
  execute function public.on_username_changed();

-- Checking a username (signing up or changing it): a name someone else
-- used in the last 7 days is "held"; your own old names are fine
create or replace function public.check_username(p_username text) returns text
language plpgsql stable security definer set search_path to public as $$
begin
  if p_username is null or p_username !~ '^[A-Za-z0-9_.-]{3,20}$' then return 'invalid'; end if;
  if lower(p_username) like 'deleted-member%' then return 'not_allowed'; end if;
  if exists (select 1 from profiles where lower(username) = lower(p_username)) then return 'taken'; end if;
  if exists (select 1 from username_history where lower(username) = lower(p_username)
             and held_until > now() and user_id is distinct from auth.uid()) then return 'held'; end if;
  if text_is_flagged(regexp_replace(p_username, '[_.-]+', ' ', 'g')) then return 'not_allowed'; end if;
  return 'ok';
end $$;


-- ---------- Shape Shifter replaces Wall of Text ----------
insert into public.achievements (key, name, description, how_to, reward_item, event_key, event_points, sort_order) values
  ('beta-shape-shifter', 'Shape Shifter', 'Changed their username while beta testing Byome.',
   'Change your username at least once (Edit profile). You can switch back: your old name is kept for you for 7 days.', null, 'beta-2026', 25, 72)
on conflict (key) do update set
  name = excluded.name, description = excluded.description, how_to = excluded.how_to,
  event_key = excluded.event_key, event_points = excluded.event_points, sort_order = excluded.sort_order;
insert into public.beta_tasks (achievement_key, side, need, is_prize, by_hand) values
  ('beta-shape-shifter', 'spice', 1, false, false)
on conflict (achievement_key) do update set side = excluded.side, need = excluded.need;

-- Wall of Text goes (its points stay with anyone who earned them)
delete from public.beta_progress where achievement_key = 'beta-wall-of-text';
delete from public.beta_tasks where achievement_key = 'beta-wall-of-text';
delete from public.event_qualifications where achievement_key = 'beta-wall-of-text';
delete from public.user_achievements where achievement_key = 'beta-wall-of-text';
delete from public.achievements where key = 'beta-wall-of-text';

-- The task counting, with Shape Shifter in and Wall of Text out
create or replace function public.beta_track() returns trigger
language plpgsql security definer set search_path to public as $$
declare
  r jsonb := case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end;
  o jsonb := case when tg_op = 'UPDATE' then to_jsonb(old) end;
  uid uuid;
begin
  begin
    if not beta_live() then return null; end if;
    uid := (r->>'user_id')::uuid;

    -- Weed Puller: automod caught it
    if tg_table_name in ('posts', 'comments', 'reviews', 'review_updates')
       and r->>'held_at' is not null and (o is null or o->>'held_at' is null)
       and text_is_flagged(coalesce(r->>'title', '') || ' ' || coalesce(r->>'body', '')) then
      perform beta_count(uid, 'beta-weed-puller', tg_table_name || ':' || (r->>'id'));
    end if;

    if tg_table_name = 'posts' then
      if tg_op = 'INSERT' then perform beta_count(uid, 'beta-say-hello', r->>'id'); end if;
    elsif tg_table_name = 'comments' and tg_op = 'INSERT' then
      if exists (select 1 from posts where id = (r->>'post_id')::uuid and user_id <> uid) then
        perform beta_count(uid, 'beta-join-the-conversation', r->>'id');
      end if;
    elsif tg_table_name = 'reviews' and tg_op = 'INSERT' then
      perform beta_count(uid, 'beta-first-impressions', r->>'id');
    elsif tg_table_name = 'daily_gifts' then
      perform beta_count(uid, 'beta-green-thumb', r->>'day');
    elsif tg_table_name = 'modmail_threads' then
      if r->>'kind' = 'feedback' then perform beta_count(uid, 'beta-speak-up', r->>'id'); end if;
    elsif tg_table_name = 'content_reports' then
      perform beta_count((r->>'reporter_id')::uuid, 'beta-snitch', r->>'id');
    elsif tg_table_name = 'user_blocks' then
      -- unblocking someone blocked during the event
      if (r->>'created_at')::timestamptz >= (select starts_at from events where key = 'beta-2026') then
        perform beta_count((r->>'blocker_id')::uuid, 'beta-frenemies', r->>'blocked_id');
      end if;
    elsif tg_table_name = 'bug_reports' then
      perform beta_count(uid, 'beta-gremlin', r->>'id');
    elsif tg_table_name = 'biome_slots' then
      -- the member arranging their own shelf (not a reward planted for them)
      if auth.uid() = uid and pg_trigger_depth() = 1 then
        perform beta_count(uid, 'beta-home-sweet-shelf', 'shelf');
      end if;
    elsif tg_table_name = 'profiles' then
      uid := (r->>'id')::uuid;
      -- Shape Shifter: a new username (not a deleted account's)
      if auth.uid() = uid and o->>'username' is distinct from r->>'username'
         and r->>'username' not ilike 'deleted-member%' then
        perform beta_count(uid, 'beta-shape-shifter', lower(r->>'username'));
      end if;
      if auth.uid() = uid and (o->>'biome_shelf' is distinct from r->>'biome_shelf'
                               or o->>'shelf_overlay' is distinct from r->>'shelf_overlay') then
        perform beta_count(uid, 'beta-home-sweet-shelf', 'shelf');
      end if;
      perform beta_check_profile(uid);
    end if;
  exception when others then
    raise warning 'Beta task tracking skipped: %', sqlerrm;
  end;
  return null;
end $$;
revoke execute on function public.beta_track() from public, anon, authenticated;

drop trigger if exists beta_track on public.profiles;
create trigger beta_track after update of username, bio, skin_type, hair_type, biome_shelf, shelf_overlay on public.profiles
  for each row execute function public.beta_track();


-- Tell the API about the changes straight away
notify pgrst, 'reload schema';

-- Check: the Spice tasks (Shape Shifter in, Wall of Text gone)
select a.name from public.beta_tasks b join public.achievements a on a.key = b.achievement_key
where b.side = 'spice' and not b.is_prize order by a.sort_order;
