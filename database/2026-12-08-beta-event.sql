-- =========================================================
-- Byome: the "Beta Testing: Sugar and Spice" event, the Beta Testing tab
-- in the Community, and the Beta tester badge on profiles.
--
-- Who's in: everyone on the beta tester list (beta_testers, from
-- 2026-12-07-beta-testers.sql). Add someone there and, straight away:
--   - the event shows for them on the Events page (nobody else sees it,
--     and its achievements stay off other members' screens),
--   - the Community has a Beta Testing tab for them. Posts there (and their
--     comments) are seen only by beta testers and moderators. Moderators
--     can see them so they can still check anything automod holds back.
--   - their profile shows a Beta tester badge (not next to their name on
--     posts or reviews). It stays as long as they're on the list, so leave
--     testers on it after the beta ends.
--
-- The event runs from today until January 31, 2027 (Central Time). It
-- doesn't touch the public events: Christmas keeps the site banner, the
-- review checkboxes, the "Part of the event" box on posts and the shop.
--
-- Two sides. Each task is worth 25 Byome points and counts by itself,
-- except the two marked "by hand":
--   Sugar (using Byome as intended): finish 5 of 7 for the Sugar prize
--   Spice (trying to break it): finish 4 of 6 for the Spice prize (the
--     ornamental pepper)
--   Both prizes: the Sugar and Spice heirloom
-- Only things done while someone is on the list count.
--
-- Handy lines (SQL Editor):
--   Credit a "by hand" task (Speed Demon, or Gremlin if needed):
--     select public.beta_credit('their-username', 'beta-speed-demon');
--   When the Sugar prize or heirloom art is in (add the item first):
--     select public.release_event_reward('beta-sugar-rush', 'item-key');
--     select public.release_event_reward('beta-sugar-and-spice', 'item-key');
--
-- Needs 2026-12-07-beta-testers.sql first. Safe to run again. Paste the
-- whole file with nothing highlighted. Run it before publishing the site
-- update that came with it.
-- =========================================================


-- ---------- Who can see beta things ----------
-- (anyone may ask; logged out, the answer is always no)
grant execute on function public.is_beta_tester() to anon;

-- Testers and moderators: who can read the Beta Testing tab
create or replace function public.can_see_beta() returns boolean
language sql stable security definer set search_path to public as $$
  select is_beta_tester() or is_moderator()
$$;
grant execute on function public.can_see_beta() to anon, authenticated;

-- The Beta tester badge on a profile
create or replace function public.beta_badge(p_user uuid) returns boolean
language sql stable security definer set search_path to public as $$
  select exists (select 1 from beta_testers where user_id = p_user)
$$;
grant execute on function public.beta_badge(uuid) to anon, authenticated;


-- ---------- Private events ----------
alter table public.events add column if not exists beta_only boolean not null default false;

drop policy if exists "Anyone can see events" on public.events;
create policy "Anyone can see events" on public.events for select using (
  not beta_only or (select public.is_beta_tester()));

-- Featuring a post puts it in the public event that's on, never the beta
create or replace function public.set_post_featured(p_post uuid, p_featured boolean) returns void
language plpgsql security definer set search_path to public as $$
declare live text;
begin
  if auth.uid() is not null and not is_moderator() then raise exception 'Only moderators can feature posts'; end if;
  select key into live from events where now() between starts_at and ends_at and not beta_only order by starts_at limit 1;
  if p_featured and live is null then raise exception 'No event is on right now'; end if;
  perform set_config('byome.pinning', 'on', true);
  if p_featured then
    update posts set event_key = coalesce(event_key, live), featured_at = now() where id = p_post;
  else
    update posts set featured_at = null where id = p_post;
  end if;
  perform set_config('byome.pinning', 'off', true);
end $$;

-- Posts can't be added to the beta event (it's for its tasks only)
create or replace function public.event_is_live(p_event text) returns boolean
language sql stable security definer set search_path to public as $$
  select exists (select 1 from events where key = p_event and now() between starts_at and ends_at and not beta_only)
$$;


-- ---------- The event ----------
insert into public.events (key, name, tagline, starts_at, ends_at, grace_until, beta_only)
values ('beta-2026', 'Beta Testing: Sugar and Spice',
        'Thank you for testing Byome! Sugar is using the site as it''s meant to be used. Spice is trying to break it.',
        '2026-10-30 05:00:00+00', '2027-02-01 05:59:00+00', '2027-02-01 05:59:00+00', true)
on conflict (key) do update set beta_only = true;

-- The Spice prize
insert into public.biome_items (key, kind, size, name, description, rarity, price, image, sort_order, max_per_member)
values ('ornamental-pepper', 'plant', 'medium', 'Ornamental pepper',
        'Small, bright and a little bit dangerous. A souvenir from Beta Testing: Sugar and Spice.',
        'rare', null, 'biome-assets/plant-ornamental-pepper.png', 40, 1)
on conflict (key) do nothing;

-- Which side each task is on, and how many times it needs doing
create table if not exists public.beta_tasks (
  achievement_key text primary key,
  side text not null check (side in ('sugar', 'spice', 'both')),
  need int not null default 1,       -- for a prize: how many of its side's tasks
  is_prize boolean not null default false,
  by_hand boolean not null default false
);
alter table public.beta_tasks enable row level security;

insert into public.achievements (key, name, description, how_to, reward_item, event_key, event_points, sort_order) values
  ('beta-make-it-yours', 'Make It Yours', 'Filled in their profile while beta testing Byome.',
   'Add a bio and your skin or hair type on Edit profile.', null, 'beta-2026', 25, 60),
  ('beta-first-impressions', 'First Impressions', 'Wrote 3 reviews while beta testing Byome.',
   'Write 3 reviews. Any rating counts.', null, 'beta-2026', 25, 61),
  ('beta-say-hello', 'Say Hello', 'Posted in the Community while beta testing Byome.',
   'Make a post or start a poll in the Community.', null, 'beta-2026', 25, 62),
  ('beta-join-the-conversation', 'Join the Conversation', 'Commented on someone else''s post while beta testing Byome.',
   'Comment on someone else''s post.', null, 'beta-2026', 25, 63),
  ('beta-speak-up', 'Speak Up', 'Sent feedback while beta testing Byome.',
   'Send feedback at least once (Mod mail, then Feedback).', null, 'beta-2026', 25, 64),
  ('beta-green-thumb', 'Green Thumb', 'Opened the daily surprise on 3 days while beta testing Byome.',
   'Open the daily surprise on 3 different days.', null, 'beta-2026', 25, 65),
  ('beta-home-sweet-shelf', 'Home Sweet Shelf', 'Arranged their shelf while beta testing Byome.',
   'Arrange your shelf: move, add or swap a plant, pot, shelf or decoration.', null, 'beta-2026', 25, 66),
  ('beta-weed-puller', 'Weed Puller', 'Got 5 things caught by automod while beta testing Byome.',
   'Get 5 different posts, comments or reviews caught by automod. Mild language only, please: no slurs, and nothing aimed at anyone.', null, 'beta-2026', 25, 70),
  ('beta-snitch', 'Snitch (Affectionately)', 'Reported something while beta testing Byome.',
   'Report a post, comment or review with the Report button.', null, 'beta-2026', 25, 71),
  ('beta-wall-of-text', 'Wall of Text', 'Wrote a very long post while beta testing Byome.',
   'Write a post that uses (nearly) all 2,000 characters: 1,900 or more.', null, 'beta-2026', 25, 72),
  ('beta-frenemies', 'Frenemies', 'Blocked and unblocked someone while beta testing Byome.',
   'Block a fellow tester, then unblock them.', null, 'beta-2026', 25, 73),
  ('beta-gremlin', 'Gremlin', 'Found a bug while beta testing Byome.',
   'Find something that breaks or looks wrong (emoji, odd symbols, very long words, tiny screens…) and report it in #bug-reports on the beta Discord. Credited by hand.', null, 'beta-2026', 25, 74),
  ('beta-speed-demon', 'Speed Demon', 'Hit the speed limit while beta testing Byome.',
   'Post so fast you hit the speed limit, and share a screenshot in the beta Discord. Credited by hand.', null, 'beta-2026', 25, 75),
  ('beta-sugar-rush', 'Sugar Rush', 'Finished the Sugar side of Beta Testing: Sugar and Spice.',
   'Finish any 5 of the 7 Sugar tasks.', null, 'beta-2026', 50, 80),
  ('beta-turn-up-the-heat', 'Turn Up the Heat', 'Finished the Spice side of Beta Testing: Sugar and Spice.',
   'Finish any 4 of the 6 Spice tasks.', 'ornamental-pepper', 'beta-2026', 50, 81),
  ('beta-sugar-and-spice', 'Sugar and Spice', 'Earned both prizes in Beta Testing: Sugar and Spice.',
   'Earn the Sugar and Spice prizes.', null, 'beta-2026', 50, 82)
on conflict (key) do update set
  name = excluded.name, description = excluded.description, how_to = excluded.how_to,
  event_key = excluded.event_key, event_points = excluded.event_points, sort_order = excluded.sort_order,
  reward_item = coalesce(public.achievements.reward_item, excluded.reward_item);

insert into public.beta_tasks (achievement_key, side, need, is_prize, by_hand) values
  ('beta-make-it-yours', 'sugar', 1, false, false),
  ('beta-first-impressions', 'sugar', 3, false, false),
  ('beta-say-hello', 'sugar', 1, false, false),
  ('beta-join-the-conversation', 'sugar', 1, false, false),
  ('beta-speak-up', 'sugar', 1, false, false),
  ('beta-green-thumb', 'sugar', 3, false, false),
  ('beta-home-sweet-shelf', 'sugar', 1, false, false),
  ('beta-weed-puller', 'spice', 5, false, false),
  ('beta-snitch', 'spice', 1, false, false),
  ('beta-wall-of-text', 'spice', 1, false, false),
  ('beta-frenemies', 'spice', 1, false, false),
  ('beta-gremlin', 'spice', 1, false, true),
  ('beta-speed-demon', 'spice', 1, false, true),
  ('beta-sugar-rush', 'sugar', 5, true, false),
  ('beta-turn-up-the-heat', 'spice', 4, true, false),
  ('beta-sugar-and-spice', 'both', 2, true, false)
on conflict (achievement_key) do update set
  side = excluded.side, need = excluded.need, is_prize = excluded.is_prize, by_hand = excluded.by_hand;


-- ---------- Counting the tasks ----------
-- Each thing that counts towards a task, once (a review, a day's
-- surprise, an automod catch...), so counts can't be undone by deleting
create table if not exists public.beta_progress (
  user_id uuid not null references public.profiles(id) on delete cascade,
  achievement_key text not null references public.beta_tasks(achievement_key),
  ref text not null,
  at timestamptz not null default now(),
  primary key (user_id, achievement_key, ref)
);
alter table public.beta_progress enable row level security;

create or replace function public.beta_live() returns boolean
language sql stable security definer set search_path to public as $$
  select exists (select 1 from events where key = 'beta-2026' and now() between starts_at and ends_at)
$$;
revoke execute on function public.beta_live() from public, anon, authenticated;

-- Gives a beta achievement and its points (a prize whose art isn't in yet
-- waits, like other events: release_event_reward hands it out later)
create or replace function public.beta_grant(p_user uuid, p_key text) returns void
language plpgsql security definer set search_path to public as $$
declare
  a achievements%rowtype;
  prize boolean;
  new_id uuid;
begin
  select * into a from achievements where key = p_key;
  select is_prize into prize from beta_tasks where achievement_key = p_key;
  if prize then
    if not event_try_grant(p_user, p_key) then
      perform create_notification(p_user, null, 'achievement', null,
        'You earned "' || a.name || '"! Its prize is still being made, and it''ll be yours (with your '
          || coalesce(a.event_points, 0) || ' Byome points) as soon as it''s ready.', 'events.html');
    end if;
    return;
  end if;
  if not grant_achievement(p_user, p_key) then return; end if;
  insert into point_ledger (user_id, action, community_points, biome_points, ref_type, ref_id)
  values (p_user, 'event_achievement', 0, coalesce(a.event_points, 0), 'achievement', md5(p_key)::uuid)
  on conflict (user_id, action, ref_id) where revoked_at is null and ref_id is not null do nothing
  returning id into new_id;
  if new_id is not null and coalesce(a.event_points, 0) > 0 then
    perform create_notification(p_user, null, 'points', new_id,
      'You earned ' || a.event_points || ' Byome points for "' || a.name || '"!', 'events.html');
  end if;
end $$;
revoke execute on function public.beta_grant(uuid, text) from public, anon, authenticated;

-- A task is done: record it, pay it, and check the prizes
create or replace function public.beta_qualify(p_user uuid, p_key text) returns void
language plpgsql security definer set search_path to public as $$
declare
  t beta_tasks%rowtype;
  done int;
begin
  select * into t from beta_tasks where achievement_key = p_key;
  if not found then return; end if;
  insert into event_qualifications (user_id, achievement_key) values (p_user, p_key) on conflict do nothing;
  if not found then return; end if;
  perform beta_grant(p_user, p_key);

  if t.side in ('sugar', 'spice') then
    -- this side's prize
    select count(*) into done from event_qualifications q join beta_tasks b on b.achievement_key = q.achievement_key
    where q.user_id = p_user and b.side = t.side and not b.is_prize;
    if not t.is_prize and done >= (select need from beta_tasks where side = t.side and is_prize) then
      perform beta_qualify(p_user, (select achievement_key from beta_tasks where side = t.side and is_prize));
    end if;
    -- both prizes: the heirloom
    if t.is_prize then
      select count(*) into done from event_qualifications q join beta_tasks b on b.achievement_key = q.achievement_key
      where q.user_id = p_user and b.is_prize and b.side in ('sugar', 'spice');
      if done >= 2 then perform beta_qualify(p_user, 'beta-sugar-and-spice'); end if;
    end if;
  end if;
end $$;
revoke execute on function public.beta_qualify(uuid, text) from public, anon, authenticated;

-- One more towards a task (a tester, while the event is on)
create or replace function public.beta_count(p_user uuid, p_key text, p_ref text) returns void
language plpgsql security definer set search_path to public as $$
declare n int;
begin
  if p_user is null or not beta_live() then return; end if;
  if not exists (select 1 from beta_testers where user_id = p_user) then return; end if;
  insert into beta_progress (user_id, achievement_key, ref) values (p_user, p_key, p_ref) on conflict do nothing;
  if not found then return; end if;
  select count(*) into n from beta_progress where user_id = p_user and achievement_key = p_key;
  if n >= (select need from beta_tasks where achievement_key = p_key) then perform beta_qualify(p_user, p_key); end if;
end $$;
revoke execute on function public.beta_count(uuid, text, text) from public, anon, authenticated;

-- Make It Yours: a bio, and a skin or hair type
create or replace function public.beta_check_profile(p_user uuid) returns void
language plpgsql security definer set search_path to public as $$
begin
  if exists (select 1 from profiles where id = p_user and coalesce(btrim(bio), '') <> ''
             and (coalesce(skin_type::text, '') <> '' or coalesce(hair_type::text, '') <> '')) then
    perform beta_count(p_user, 'beta-make-it-yours', 'profile');
  end if;
end $$;
revoke execute on function public.beta_check_profile(uuid) from public, anon, authenticated;

-- What happened on the site, for the tasks that count themselves. A
-- problem here never stops the member's own action (it's only logged).
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
      if char_length(r->>'body') >= 1900 then perform beta_count(uid, 'beta-wall-of-text', r->>'id'); end if;
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

drop trigger if exists beta_track on public.posts;
create trigger beta_track after insert or update of held_at, body on public.posts
  for each row execute function public.beta_track();
drop trigger if exists beta_track on public.comments;
create trigger beta_track after insert or update of held_at on public.comments
  for each row execute function public.beta_track();
drop trigger if exists beta_track on public.reviews;
create trigger beta_track after insert or update of held_at on public.reviews
  for each row execute function public.beta_track();
drop trigger if exists beta_track on public.review_updates;
create trigger beta_track after insert or update of held_at on public.review_updates
  for each row execute function public.beta_track();
drop trigger if exists beta_track on public.daily_gifts;
create trigger beta_track after insert on public.daily_gifts
  for each row execute function public.beta_track();
drop trigger if exists beta_track on public.modmail_threads;
create trigger beta_track after insert on public.modmail_threads
  for each row execute function public.beta_track();
drop trigger if exists beta_track on public.content_reports;
create trigger beta_track after insert on public.content_reports
  for each row execute function public.beta_track();
drop trigger if exists beta_track on public.user_blocks;
create trigger beta_track after delete on public.user_blocks
  for each row execute function public.beta_track();
drop trigger if exists beta_track on public.bug_reports;
create trigger beta_track after insert on public.bug_reports
  for each row execute function public.beta_track();
drop trigger if exists beta_track on public.biome_slots;
create trigger beta_track after insert or update or delete on public.biome_slots
  for each row execute function public.beta_track();
drop trigger if exists beta_track on public.profiles;
create trigger beta_track after update of bio, skin_type, hair_type, biome_shelf, shelf_overlay on public.profiles
  for each row execute function public.beta_track();

-- Someone already has a full profile when they join the list
create or replace function public.beta_tester_joined() returns trigger
language plpgsql security definer set search_path to public as $$
begin
  begin
    perform beta_check_profile(new.user_id);
  exception when others then
    raise warning 'Beta profile check skipped: %', sqlerrm;
  end;
  return null;
end $$;
drop trigger if exists beta_testers_joined on public.beta_testers;
create trigger beta_testers_joined after insert on public.beta_testers
  for each row execute function public.beta_tester_joined();

-- By hand (SQL Editor): Speed Demon, or anything that didn't count itself
create or replace function public.beta_credit(p_username text, p_task text) returns text
language plpgsql security definer set search_path to public as $$
declare
  uid uuid;
  t beta_tasks%rowtype;
begin
  select user_id into uid from beta_testers where lower(username) = lower(btrim(p_username));
  if uid is null then return 'No beta tester is called "' || btrim(p_username) || '". Check the spelling.'; end if;
  select * into t from beta_tasks where achievement_key = p_task;
  if not found or t.is_prize then
    return 'There''s no task "' || p_task || '". Tasks: ' ||
      (select string_agg(achievement_key, ', ' order by achievement_key) from beta_tasks where not is_prize);
  end if;
  if exists (select 1 from event_qualifications where user_id = uid and achievement_key = p_task) then
    return btrim(p_username) || ' already has that one.';
  end if;
  perform beta_qualify(uid, p_task);
  return 'Done: ' || btrim(p_username) || ' has "' || (select name from achievements where key = p_task) || '" and its points.';
end $$;
revoke execute on function public.beta_credit(text, text) from public, anon, authenticated;


-- ---------- The Events page ----------
-- The beta event for a tester: both sides, their tasks, the prizes and
-- your progress. Nothing for anyone else.
create or replace function public.beta_overview() returns jsonb
language plpgsql stable security definer set search_path to public as $$
declare
  me uuid := auth.uid();
  e events%rowtype;
begin
  if not is_beta_tester() then return null; end if;
  select * into e from events where key = 'beta-2026';
  if not found then return null; end if;
  return jsonb_build_object('key', e.key, 'name', e.name, 'tagline', e.tagline, 'beta_only', true,
    'status', case when now() < e.starts_at then 'upcoming' when now() <= e.ends_at then 'live' else 'ended' end,
    'starts_at', e.starts_at, 'ends_at', e.ends_at, 'badge_image', e.badge_image,
    'tasks', (select coalesce(jsonb_agg(jsonb_build_object(
        'key', a.key, 'name', a.name, 'how_to', a.how_to, 'points', a.event_points,
        'side', b.side, 'need', b.need, 'is_prize', b.is_prize, 'by_hand', b.by_hand,
        'reward', case when i.key is not null then jsonb_build_object(
          'key', i.key, 'name', i.name, 'image', i.image, 'kind', i.kind, 'rarity', i.rarity, 'size', i.size, 'over_pot', i.over_pot) end,
        'earned', exists (select 1 from user_achievements u where u.user_id = me and u.achievement_key = a.key),
        'qualified', exists (select 1 from event_qualifications q where q.user_id = me and q.achievement_key = a.key),
        'have', case when b.is_prize then (select count(*) from event_qualifications q join beta_tasks x on x.achievement_key = q.achievement_key
                       where q.user_id = me and not x.is_prize and x.side = b.side)
                     else (select count(*) from beta_progress p where p.user_id = me and p.achievement_key = a.key) end)
        order by a.sort_order), '[]'::jsonb)
      from achievements a join beta_tasks b on b.achievement_key = a.key left join biome_items i on i.key = a.reward_item));
end $$;
revoke execute on function public.beta_overview() from public, anon;
grant execute on function public.beta_overview() to authenticated;


-- ---------- The Beta Testing tab in the Community ----------
-- Posts in the "Beta Testing" category, and their comments and polls, are
-- only for testers and moderators. Only testers and moderators can post
-- there.
drop policy if exists "Beta Testing posts are for testers" on public.posts;
create policy "Beta Testing posts are for testers" on public.posts as restrictive for select to anon, authenticated
  using (category is distinct from 'Beta Testing' or (select public.can_see_beta()));

create or replace function public.is_beta_post(p_post uuid) returns boolean
language sql stable security definer set search_path to public as $$
  select exists (select 1 from posts where id = p_post and category = 'Beta Testing')
$$;
revoke execute on function public.is_beta_post(uuid) from public, anon;
grant execute on function public.is_beta_post(uuid) to authenticated;

drop policy if exists "Beta Testing comments are for testers" on public.comments;
create policy "Beta Testing comments are for testers" on public.comments as restrictive for select to anon, authenticated
  using ((select public.can_see_beta()) or not public.is_beta_post(post_id));
-- (polls and their options already follow their post)

create or replace function public.beta_tab_only_testers() returns trigger
language plpgsql security definer set search_path to public as $$
declare r jsonb := to_jsonb(new);
begin
  if auth.uid() is not null and not can_see_beta() and (
       (tg_table_name = 'posts' and r->>'category' = 'Beta Testing')
    or (tg_table_name = 'comments' and is_beta_post((r->>'post_id')::uuid))) then
    raise exception 'Only beta testers can post in Beta Testing.';
  end if;
  return new;
end $$;
drop trigger if exists beta_tab_only_testers on public.posts;
create trigger beta_tab_only_testers before insert or update of category on public.posts
  for each row execute function public.beta_tab_only_testers();
drop trigger if exists beta_tab_only_testers on public.comments;
create trigger beta_tab_only_testers before insert on public.comments
  for each row execute function public.beta_tab_only_testers();


-- Tell the API about the new functions straight away
notify pgrst, 'reload schema';

-- Check: the event, and everyone on the beta tester list
select name, starts_at at time zone 'America/Chicago' as starts_central,
       ends_at at time zone 'America/Chicago' as ends_central, beta_only
from public.events where key = 'beta-2026';
select username, added_at from public.beta_testers order by added_at;
