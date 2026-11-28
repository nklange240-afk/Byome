-- =========================================================
-- Byome: Cozy Christmas, the Christmas event.
--
--  Runs Nov 28, 2026 12:00 am Central to Jan 4, 2027 11:59 pm Central.
--  Things started during it can still be finished until Jan 18 (a
--  friend's first post or review, comments being approved).
--
--  CHALLENGES DROP WEEKLY. A new set every Saturday (Nov 28, Dec 5, 12,
--  19, 26); each week's challenges stay open until the event ends, so
--  members who join late can still do earlier weeks. A week that hasn't
--  dropped yet stays hidden, and nothing done before its drop counts.
--  Each challenge pays its Byome points as soon as it's done; its prize
--  follows as soon as its art is ready (release_event_reward, below).
--
--  Week 1 (25 Byome points each):
--   Trim the Tree       put your Mini Christmas tree on your shelf
--                       (prize: the Snowflake decorations for the tree)
--   Dear Santa          a comment (50+ characters) on the pinned wish-list post
--   Winter Rescue       a review ticked "This is a winter or holiday product"
--   Spread Some Cheer   comments on 5 different posts by other members
--                       (prize: the Cardinal)
--   Secret Santa        a friend who joins during the event makes a post or
--                       writes a review
--   Advent Stamps       3 stamps on the event calendar
--   Cozy Week (50)      any 4 of the 6 above
--
--  THE CALENDAR. Opening the daily surprise adds a stamp (one a day; days
--  don't need to be in a row, and each member starts whenever they like).
--  Seven stamps fill a card; stamps 2, 4 and 6 give 15 Byome points and
--  stamp 7 gives 75. The first card's stamp 7 gives the calendar prize
--  instead, once it exists. A full card starts a new one the next day.
--
--  The review checkbox reads "This is a winter or holiday product." during
--  Cozy Christmas ("I no longer use this" is Haunted Harvest's only).
--
-- Run in the Supabase SQL Editor. Safe to run again. Paste the whole file
-- with nothing highlighted. Needs 2027-01-03-christmas-tree.sql and
-- 2026-11-26-daily-surprise.sql first. Run it before publishing the site
-- update that came with it.
--
-- Handy lines (SQL Editor):
--  * After posting the wish-list thread (this also features it):
--      select public.set_event_story_post('christmas-2026', 'paste the post link here');
--  * When a prize's art is in (I'll add the item; this hands it out):
--      select public.release_event_reward('cc-trim-the-tree', 'item-key');
--  * When the calendar prize is in (this also gives it to anyone who
--    has already filled their first card):
--      select public.release_calendar_item('christmas-2026', 'item-key');
-- =========================================================


-- ---------- The event ----------
insert into public.events (key, name, tagline, starts_at, ends_at, grace_until, badge_image, biome, calendar)
values ('christmas-2026', 'Cozy Christmas',
        'Trim the tree, spread some cheer and stamp your calendar. New challenges every Saturday.',
        '2026-11-28 00:00 America/Chicago', '2027-01-04 23:59 America/Chicago', '2027-01-18 23:59 America/Chicago',
        'biome-assets/pot-christmas-tree.png', 'tundra', true)
on conflict (key) do update set calendar = true;

-- The review checkboxes each event shows (null: that box isn't shown)
alter table public.events add column if not exists seasonal_label text;
alter table public.events add column if not exists no_longer_using_box boolean not null default false;
update public.events set seasonal_label = 'This is a fall or seasonal product.', no_longer_using_box = true
where key = 'halloween-2026' and seasonal_label is null;
update public.events set seasonal_label = 'This is a winter or holiday product.'
where key = 'christmas-2026' and seasonal_label is null;

-- Weekly drops: the week a challenge belongs to and when it appears; a
-- week's bonus needs this many of that week's other challenges
alter table public.achievements add column if not exists week int;
alter table public.achievements add column if not exists drops_at timestamptz;
alter table public.achievements add column if not exists bonus_need int;


-- ---------- Decorations you unlock ----------
-- A theme can be a prize: members see it once they own its unlock item (a
-- "theme" item, which isn't placed on the shelf itself). Themes without
-- one are for everyone who has the item.
alter table public.biome_items drop constraint if exists biome_items_kind_check;
alter table public.biome_items add constraint biome_items_kind_check
  check (kind in ('pot', 'plant', 'shelf', 'biome', 'companion', 'shelf_overlay', 'theme'));
alter table public.biome_items drop constraint if exists biome_items_check;
alter table public.biome_items add constraint biome_items_check check (
  (kind in ('shelf', 'biome', 'shelf_overlay', 'theme') and size is null)
  or (kind in ('pot', 'plant') and size is not null)
  or kind = 'companion');
alter table public.item_themes add column if not exists unlock_item text references public.biome_items(key);

-- Choose the decorations for the pot in a spot (the same as in
-- 2027-01-03-christmas-tree.sql, plus: a prize theme needs its unlock item)
create or replace function public.set_biome_theme(p_slot int, p_theme text) returns void
language plpgsql security definer set search_path to public as $$
declare
  me uuid := auth.uid();
  pot text;
  t item_themes%rowtype;
begin
  if me is null then raise exception 'Please log in first'; end if;
  select pot_key into pot from biome_slots where user_id = me and slot = p_slot;
  if pot is null then raise exception 'There''s nothing in that spot'; end if;
  if p_theme is not null then
    select * into t from item_themes where item_key = pot and key = p_theme;
    if not found then raise exception 'That decoration isn''t for this one'; end if;
    if t.unlock_item is not null and not exists (select 1 from biome_inventory where user_id = me and item_key = t.unlock_item) then
      raise exception 'You haven''t unlocked the % decorations yet', t.name;
    end if;
  end if;
  update biome_slots set theme = p_theme, updated_at = now() where user_id = me and slot = p_slot;
end $$;
revoke execute on function public.set_biome_theme(int, text) from public, anon;
grant execute on function public.set_biome_theme(int, text) to authenticated;


-- ---------- Prizes ready so far ----------
insert into public.biome_items (key, kind, size, name, description, rarity, price, image, sort_order, max_per_member)
values ('tree-snowflake', 'theme', null, 'Snowflake decorations',
        'Icy blue baubles and drifting snowflakes for your Mini Christmas tree. Choose them when you arrange your shelf. For trimming the tree during Cozy Christmas 2026.',
        'uncommon', null, 'biome-assets/tree-snowflake.png', 1, 1)
on conflict (key) do nothing;
insert into public.item_themes (item_key, key, name, color, image, sort_order, is_default, unlock_item)
values ('christmas-tree', 'snowflake', 'Snowflake', '#9fd3f0', 'biome-assets/tree-snowflake.png', 2, false, 'tree-snowflake')
on conflict (item_key, key) do update set unlock_item = excluded.unlock_item, image = excluded.image;

insert into public.biome_items (key, kind, size, name, description, rarity, price, image, sort_order, max_per_member)
values ('cardinal', 'companion', null, 'Cardinal',
        'A flash of red on a snowy day, perched and full of cheer. For spreading some cheer during Cozy Christmas 2026.',
        'uncommon', null, 'biome-assets/companion-cardinal.png', 5, 1)
on conflict (key) do nothing;


-- ---------- Week 1 ----------
insert into public.achievements (key, name, description, how_to, reward_item, event_key, event_points, sort_order, week, drops_at, bonus_need) values
  ('cc-trim-the-tree', 'Trim the Tree',
   'Put up a Christmas tree, during Cozy Christmas 2026.',
   'Put your Mini Christmas tree on your shelf. Every member gets one: find it under "Edit my shelf."',
   'tree-snowflake', 'christmas-2026', 25, 50, 1, '2026-11-28 00:00 America/Chicago', null),
  ('cc-dear-santa', 'Dear Santa',
   'Shared a beauty wish list, during Cozy Christmas 2026.',
   'What''s on your beauty wish list this year? Tell us in the pinned post. At least 50 characters.',
   null, 'christmas-2026', 25, 51, 1, '2026-11-28 00:00 America/Chicago', null),
  ('cc-winter-rescue', 'Winter Rescue',
   'Reviewed a cold-weather rescue, during Cozy Christmas 2026.',
   'Review a product that saves your skin or hair in the cold, and tick "This is a winter or holiday product." Any rating counts.',
   null, 'christmas-2026', 25, 52, 1, '2026-11-28 00:00 America/Chicago', null),
  ('cc-spread-cheer', 'Spread Some Cheer',
   'Cheered on 5 members, during Cozy Christmas 2026.',
   'Leave a comment on 5 different posts by other members.',
   'cardinal', 'christmas-2026', 25, 53, 1, '2026-11-28 00:00 America/Chicago', null),
  ('cc-secret-santa', 'Secret Santa',
   'Brought a friend to Byome, during Cozy Christmas 2026.',
   'Invite a friend who joins during the event. It counts once they''ve made a post or written a review.',
   null, 'christmas-2026', 25, 54, 1, '2026-11-28 00:00 America/Chicago', null),
  ('cc-advent-stamps', 'Advent Stamps',
   'Collected 3 calendar stamps, during Cozy Christmas 2026.',
   'Open the daily surprise on 3 different days to collect 3 stamps on your calendar. Days don''t need to be in a row.',
   null, 'christmas-2026', 25, 55, 1, '2026-11-28 00:00 America/Chicago', null),
  ('cc-cozy-week-1', 'Cozy Week',
   'Completed 4 week 1 challenges, during Cozy Christmas 2026.',
   'Complete any 4 of this week''s 6 challenges.',
   null, 'christmas-2026', 50, 59, 1, '2026-11-28 00:00 America/Chicago', 4)
on conflict (key) do update set
  name = excluded.name, description = excluded.description, how_to = excluded.how_to,
  event_key = excluded.event_key, event_points = excluded.event_points, sort_order = excluded.sort_order,
  week = excluded.week, drops_at = excluded.drops_at, bonus_need = excluded.bonus_need,
  reward_item = coalesce(public.achievements.reward_item, excluded.reward_item);


-- ---------- Earning them ----------
-- The Christmas event, if it's on (or finishing)
create or replace function public.cozy_christmas() returns public.events
language sql stable security definer set search_path to public as $$
  select * from events where key = 'christmas-2026'
$$;
revoke execute on function public.cozy_christmas() from public, anon, authenticated;

-- Records that a member did a challenge (once), pays its points straight
-- away, gives its prize if it's ready, and checks the week's bonus
create or replace function public.cc_qualify(p_user uuid, p_key text) returns void
language plpgsql security definer set search_path to public as $$
declare
  a achievements%rowtype;
  e events%rowtype;
  new_id uuid;
  bonus achievements%rowtype;
  done int;
begin
  select * into a from achievements where key = p_key;
  select * into e from events where key = a.event_key;
  if e.key is null or now() < e.starts_at or now() > e.grace_until then return; end if;
  if a.drops_at is not null and now() < a.drops_at then return; end if;
  if exists (select 1 from profiles where id = p_user and deleted_at is not null) then return; end if;

  insert into event_qualifications (user_id, achievement_key) values (p_user, p_key) on conflict do nothing;
  if not found then return; end if;

  -- the points, now (the same ledger line event_try_grant would add, so
  -- they're never paid twice)
  insert into point_ledger (user_id, action, community_points, biome_points, ref_type, ref_id)
  values (p_user, 'event_achievement', 0, coalesce(a.event_points, 0), 'achievement', md5(p_key)::uuid)
  on conflict (user_id, action, ref_id) where revoked_at is null and ref_id is not null do nothing
  returning id into new_id;

  if a.reward_item is not null then
    perform event_try_grant(p_user, p_key);
    if new_id is not null then
      perform create_notification(p_user, null, 'points', new_id,
        'You earned ' || coalesce(a.event_points, 0) || ' Byome points for "' || a.name || '"!', 'events.html');
    end if;
  elsif new_id is not null then
    perform create_notification(p_user, null, 'points', new_id,
      'You completed "' || a.name || '"! Here are your ' || coalesce(a.event_points, 0)
        || ' Byome points. Its prize is still being made, and it''ll be yours as soon as it''s ready.', 'events.html');
  end if;

  -- this week's bonus
  if a.week is not null and a.bonus_need is null then
    select * into bonus from achievements
    where event_key = a.event_key and week = a.week and bonus_need is not null limit 1;
    if bonus.key is not null then
      select count(*) into done from event_qualifications q join achievements x on x.key = q.achievement_key
      where q.user_id = p_user and x.event_key = a.event_key and x.week = a.week and x.bonus_need is null;
      if done >= bonus.bonus_need then perform cc_qualify(p_user, bonus.key); end if;
    end if;
  end if;
end $$;
revoke execute on function public.cc_qualify(uuid, text) from public, anon, authenticated;

-- Is this moment inside the event (for things done, not finished)?
create or replace function public.cc_during(p_at timestamptz) returns boolean
language sql stable security definer set search_path to public as $$
  select exists (select 1 from events where key = 'christmas-2026' and p_at between starts_at and ends_at)
$$;
revoke execute on function public.cc_during(timestamptz) from public, anon, authenticated;

-- Trim the Tree: the tree on your shelf
create or replace function public.cc_on_slot() returns trigger
language plpgsql security definer set search_path to public as $$
begin
  if new.pot_key = 'christmas-tree' and cc_during(now()) then perform cc_qualify(new.user_id, 'cc-trim-the-tree'); end if;
  return new;
end $$;
drop trigger if exists cc_after_slot on public.biome_slots;
create trigger cc_after_slot after insert or update of pot_key on public.biome_slots
  for each row execute function public.cc_on_slot();

-- Spread Some Cheer: comments on 5 different posts by other members
create or replace function public.cc_check_cheer(p_user uuid) returns void
language plpgsql security definer set search_path to public as $$
declare e events := cozy_christmas();
begin
  if e.key is null then return; end if;
  if (select count(distinct c.post_id) from comments c join posts p on p.id = c.post_id
      where c.user_id = p_user and p.user_id <> p_user and c.held_at is null and p.held_at is null
        and c.created_at between e.starts_at and e.ends_at) >= 5 then
    perform cc_qualify(p_user, 'cc-spread-cheer');
  end if;
end $$;
revoke execute on function public.cc_check_cheer(uuid) from public, anon, authenticated;

-- Dear Santa and Spread Some Cheer
create or replace function public.cc_on_comment() returns trigger
language plpgsql security definer set search_path to public as $$
declare e events := cozy_christmas();
begin
  if new.held_at is not null or e.key is null or not cc_during(new.created_at) then return new; end if;
  if e.story_post_id is not null and new.post_id = e.story_post_id and event_text_length(new.body) >= 50 then
    perform cc_qualify(new.user_id, 'cc-dear-santa');
  end if;
  perform cc_check_cheer(new.user_id);
  return new;
end $$;
drop trigger if exists cc_after_comment on public.comments;
create trigger cc_after_comment after insert or update of held_at, body on public.comments
  for each row execute function public.cc_on_comment();

-- Secret Santa: a friend who joined during the event has made a post or
-- written a review
create or replace function public.cc_check_secret_santa(p_friend uuid) returns void
language plpgsql security definer set search_path to public as $$
declare inviter uuid;
begin
  select r.referrer_id into inviter from referrals r where r.referred_id = p_friend and cc_during(r.created_at);
  if inviter is null then return; end if;
  if exists (select 1 from posts p where p.user_id = p_friend and p.held_at is null)
     or exists (select 1 from reviews v where v.user_id = p_friend and v.held_at is null) then
    perform cc_qualify(inviter, 'cc-secret-santa');
  end if;
end $$;
revoke execute on function public.cc_check_secret_santa(uuid) from public, anon, authenticated;

-- Winter Rescue, and Secret Santa for the reviewer's inviter
create or replace function public.cc_on_review() returns trigger
language plpgsql security definer set search_path to public as $$
begin
  if new.held_at is not null then return new; end if;
  if new.seasonal and cc_during(new.created_at) then perform cc_qualify(new.user_id, 'cc-winter-rescue'); end if;
  perform cc_check_secret_santa(new.user_id);
  return new;
end $$;
drop trigger if exists cc_after_review on public.reviews;
create trigger cc_after_review after insert or update of held_at, seasonal on public.reviews
  for each row execute function public.cc_on_review();

create or replace function public.cc_on_post() returns trigger
language plpgsql security definer set search_path to public as $$
begin
  if new.held_at is null then perform cc_check_secret_santa(new.user_id); end if;
  return new;
end $$;
drop trigger if exists cc_after_post on public.posts;
create trigger cc_after_post after insert or update of held_at on public.posts
  for each row execute function public.cc_on_post();

-- Advent Stamps: 3 stamps on the calendar
create or replace function public.cc_on_daily_gift() returns trigger
language plpgsql security definer set search_path to public as $$
begin
  if new.event_key = 'christmas-2026'
     and (select count(*) from daily_gifts where user_id = new.user_id and event_key = new.event_key) >= 3 then
    perform cc_qualify(new.user_id, 'cc-advent-stamps');
  end if;
  return new;
end $$;
drop trigger if exists cc_after_daily_gift on public.daily_gifts;
create trigger cc_after_daily_gift after insert on public.daily_gifts
  for each row execute function public.cc_on_daily_gift();


-- ---------- The calendar: a new card every 7 stamps ----------
alter table public.daily_gifts add column if not exists calendar_card int;

-- (the same as in 2026-11-26-daily-surprise.sql, plus the card number)
create or replace function public.daily_gift_json(g daily_gifts) returns jsonb
language sql stable security definer set search_path to public as $$
  select jsonb_build_object(
    'tier', g.tier, 'points', g.points, 'duplicate', g.duplicate,
    'item', (select jsonb_build_object('key', i.key, 'name', i.name, 'image', i.image, 'kind', i.kind,
                                       'size', i.size, 'rarity', i.rarity, 'over_pot', i.over_pot)
             from biome_items i where i.key = g.item_key),
    'calendar_stamp', g.calendar_stamp, 'calendar_card', g.calendar_card, 'calendar_points', g.calendar_points,
    'calendar_item', (select jsonb_build_object('key', i.key, 'name', i.name, 'image', i.image, 'kind', i.kind,
                                                'size', i.size, 'rarity', i.rarity, 'over_pot', i.over_pot)
                      from biome_items i where i.key = g.calendar_item))
$$;
revoke execute on function public.daily_gift_json(daily_gifts) from public, anon, authenticated;

-- The calendar of whichever event is on: which card you're on and how many
-- stamps it has (a full card stays showing until the next stamp starts a
-- new one). Null if no event with a calendar is on.
create or replace function public.daily_calendar(p_user uuid) returns jsonb
language sql stable security definer set search_path to public as $$
  select jsonb_build_object(
    'event_key', e.key, 'name', e.name, 'ends_at', e.ends_at, 'total', 7,
    'all_stamps', n.all_stamps,
    'card', case when n.all_stamps = 0 then 1 else (n.all_stamps - 1) / 7 + 1 end,
    'stamps', case when n.all_stamps = 0 then 0 else (n.all_stamps - 1) % 7 + 1 end,
    'item', (select jsonb_build_object('key', i.key, 'name', i.name, 'image', i.image, 'kind', i.kind,
                                       'size', i.size, 'rarity', i.rarity, 'over_pot', i.over_pot)
             from biome_items i where i.key = e.calendar_item))
  from events e,
       lateral (select count(*)::int as all_stamps from daily_gifts g where g.user_id = p_user and g.event_key = e.key) n
  where e.calendar and now() >= e.starts_at and now() < e.ends_at
  order by e.starts_at desc limit 1
$$;
revoke execute on function public.daily_calendar(uuid) from public, anon, authenticated;

-- Open today's packet (the same as in 2026-11-26-daily-surprise.sql, except
-- the calendar: every stamp counts, a new card every 7)
create or replace function public.claim_daily_gift() returns jsonb
language plpgsql security definer set search_path to public as $$
declare
  me uuid := auth.uid();
  today date := byome_today();
  roll numeric;
  g daily_gifts%rowtype;
  ev events%rowtype;
  stamp int;
begin
  if me is null then raise exception 'Please log in first'; end if;
  if not exists (select 1 from profiles where id = me and deleted_at is null) then raise exception 'Please log in first'; end if;
  -- one at a time per member, so a double tap can't open two packets
  perform pg_advisory_xact_lock(hashtext('daily-gift'), hashtext(me::text));
  if exists (select 1 from daily_gifts where user_id = me and day = today) then
    raise exception 'You''ve already opened today''s surprise. Come back tomorrow!';
  end if;

  g.id := gen_random_uuid();
  g.user_id := me;
  g.day := today;
  g.points := 0;
  g.duplicate := false;
  g.calendar_points := 0;
  g.created_at := now();

  roll := floor(random() * 10000);
  if roll < 2050 then g.tier := 'small'; g.points := 2 + floor(random() * 2);
  elsif roll < 6750 then g.tier := 'small'; g.points := 4 + floor(random() * 3);
  elsif roll < 7750 then g.tier := 'good'; g.points := 10;
  elsif roll < 8250 then g.tier := 'good'; g.points := 20;
  elsif roll < 8500 then g.tier := 'great'; g.points := 30;
  elsif roll < 8650 then g.tier := 'great'; g.points := 50;
  elsif roll < 8750 then g.tier := 'lucky'; g.points := 100;
  elsif roll < 8775 then g.tier := 'jackpot'; g.points := 200;
  elsif roll < 9775 then g.tier := 'item'; g.item_key := daily_pick_item(me, 'common', false);
    if g.item_key is null then g.tier := 'good'; g.points := 10; end if;
  elsif roll < 9975 then g.tier := 'rare'; g.item_key := daily_pick_item(me, 'rare', true);
    if g.item_key is null then g.points := 50; end if;
  else g.tier := 'heirloom'; g.item_key := daily_pick_item(me, 'heirloom', true);
    if g.item_key is null then g.points := 150; end if;
  end if;
  if g.item_key is not null then
    g.duplicate := exists (select 1 from biome_inventory where user_id = me and item_key = g.item_key);
  end if;

  -- The event calendar: the stamp's place on its card (1 to 7) and the card
  select * into ev from events where calendar and now() >= starts_at and now() < ends_at order by starts_at desc limit 1;
  if found then
    g.event_key := ev.key;
    stamp := (select count(*) from daily_gifts where user_id = me and event_key = ev.key) + 1;
    g.calendar_card := (stamp - 1) / 7 + 1;
    g.calendar_stamp := (stamp - 1) % 7 + 1;
    if g.calendar_stamp in (2, 4, 6) then g.calendar_points := 15;
    elsif g.calendar_stamp = 7 then
      if g.calendar_card = 1 and ev.calendar_item is not null then g.calendar_item := ev.calendar_item;
      else g.calendar_points := 75; end if;
    end if;
  end if;

  insert into daily_gifts values (g.*);
  if g.points > 0 then
    insert into point_ledger (user_id, action, community_points, biome_points, ref_type, ref_id)
    values (me, 'daily_gift', 0, g.points, 'daily_gift', g.id);
  end if;
  if g.item_key is not null then
    insert into biome_inventory (user_id, item_key, source) values (me, g.item_key, 'daily');
  end if;
  if g.calendar_points > 0 then
    insert into point_ledger (user_id, action, community_points, biome_points, ref_type, ref_id)
    values (me, 'event_calendar', 0, g.calendar_points, 'daily_gift', g.id);
  end if;
  if g.calendar_item is not null then
    insert into biome_inventory (user_id, item_key, source) values (me, g.calendar_item, 'daily');
  end if;

  return daily_gift_json(g) || jsonb_build_object('calendar', daily_calendar(me));
end $$;
revoke execute on function public.claim_daily_gift() from public, anon;
grant execute on function public.claim_daily_gift() to authenticated;

-- When the calendar prize's art is ready: set it, and give it to everyone
-- who already filled their first card (they got 75 points then; they keep
-- those). SQL Editor only.
create or replace function public.release_calendar_item(p_event text, p_item text) returns text
language plpgsql security definer set search_path to public as $$
declare
  r record;
  n int := 0;
  item_name text;
begin
  select name into item_name from biome_items where key = p_item;
  if item_name is null then return 'There''s no item "' || p_item || '" yet.'; end if;
  update events set calendar_item = p_item where key = p_event;
  if not found then return 'There''s no event "' || p_event || '".'; end if;
  for r in
    select g.id, g.user_id from daily_gifts g
    where g.event_key = p_event and g.calendar_card = 1 and g.calendar_stamp = 7 and g.calendar_item is null
  loop
    update daily_gifts set calendar_item = p_item where id = r.id;
    insert into biome_inventory (user_id, item_key, source) values (r.user_id, p_item, 'daily');
    perform create_notification(r.user_id, null, 'gift', null,
      'Your calendar prize is here: the ' || item_name || '! Thanks for filling your first card.', 'profile.html?shelf=edit');
    n := n + 1;
  end loop;
  return 'Done: ' || n || ' member' || case when n = 1 then '' else 's' end || ' who already filled their first card got it.';
end $$;
revoke execute on function public.release_calendar_item(text, text) from public, anon, authenticated;


-- The event's pinned thread (Dear Santa's wish-list post): paste the post's
-- link (or its id). It's featured in the event, and pinned to the top of
-- the Community too. (The same as in 2026-10-29-events-halloween.sql, with
-- wording for any event, and pinning.) SQL Editor only.
create or replace function public.set_event_story_post(p_event text, p_post text) returns text
language plpgsql security definer set search_path to public as $$
declare
  pid uuid := (substring(p_post from '[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}'))::uuid;
  t text;
begin
  if pid is null then return 'That doesn''t look like a post link.'; end if;
  select title into t from posts where id = pid;
  if t is null then return 'There''s no post with that link.'; end if;
  update events set story_post_id = pid where key = p_event;
  if not found then return 'There''s no event "' || p_event || '".'; end if;
  perform set_config('byome.pinning', 'on', true);
  update posts set event_key = p_event, featured_at = coalesce(featured_at, now()),
                   pinned_at = coalesce(pinned_at, now()) where id = pid;
  perform set_config('byome.pinning', 'off', true);
  return 'Done: "' || t || '" is the event''s pinned post, and it''s featured.';
end $$;
revoke execute on function public.set_event_story_post(text, text) from public, anon, authenticated;


-- ---------- The Events page ----------
-- (the same as in 2026-10-29-events-halloween.sql, plus: challenges that
-- haven't dropped yet are left out, each has its week, and your calendar)
create or replace function public.event_overview(p_event text) returns jsonb
language plpgsql stable security definer set search_path to public as $$
declare
  me uuid := auth.uid();
  e events%rowtype;
  status text;
  list jsonb;
begin
  select * into e from events where key = p_event;
  if not found then return null; end if;
  status := case when now() < e.starts_at then 'upcoming' when now() <= e.ends_at then 'live'
                 when now() <= e.grace_until then 'finishing' else 'ended' end;
  if status = 'upcoming' then
    return jsonb_build_object('key', e.key, 'name', e.name, 'status', status, 'biome', e.biome,
      'starts_at', e.starts_at, 'ends_at', e.ends_at, 'grace_until', e.grace_until);
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'key', a.key, 'name', a.name, 'how_to', a.how_to, 'points', a.event_points,
    'week', a.week, 'drops_at', a.drops_at, 'bonus', a.bonus_need is not null,
    'reward', case when i.key is not null then jsonb_build_object(
      'key', i.key, 'name', i.name, 'image', i.image, 'kind', i.kind, 'rarity', i.rarity, 'size', i.size, 'over_pot', i.over_pot) end,
    'earned', me is not null and exists (select 1 from user_achievements u where u.user_id = me and u.achievement_key = a.key),
    'qualified', me is not null and exists (select 1 from event_qualifications q where q.user_id = me and q.achievement_key = a.key),
    'progress', case
      when me is null then null
      when a.key = 'hh-fresh-blood' then jsonb_build_object('have', (select count(*) from products p
        where p.suggested_by = me and p.status = 'approved' and p.created_at between e.starts_at and e.ends_at), 'need', 3)
      when a.key = 'hh-friendly-ghost' then jsonb_build_object('have', (select count(*) from referrals r
        where r.referrer_id = me and r.created_at between e.starts_at and e.ends_at
          and exists (select 1 from posts p where p.user_id = r.referred_id and p.held_at is null)
          and exists (select 1 from reviews v where v.user_id = r.referred_id and v.held_at is null)), 'need', 2)
      when a.key = 'hh-bait-the-trap' then jsonb_build_object('have', coalesce((select max(n) from (
        select count(distinct v.user_id) n from posts p join polls pl on pl.post_id = p.id
        join poll_votes v on v.post_id = p.id and v.user_id <> me
        where p.user_id = me and pl.created_at between e.starts_at and e.ends_at group by p.id) x), 0), 'need', 5)
      when a.key = 'hh-harvest-moon' then jsonb_build_object('have', (select count(*) from event_qualifications q
        join achievements x on x.key = q.achievement_key
        where q.user_id = me and x.event_key = e.key and x.key <> 'hh-harvest-moon'), 'need', 5)
      when a.key = 'cc-spread-cheer' then jsonb_build_object('have', (select count(distinct c.post_id)
        from comments c join posts p on p.id = c.post_id
        where c.user_id = me and p.user_id <> me and c.held_at is null and p.held_at is null
          and c.created_at between e.starts_at and e.ends_at), 'need', 5)
      when a.key = 'cc-advent-stamps' then jsonb_build_object('have', (select count(*) from daily_gifts g
        where g.user_id = me and g.event_key = e.key), 'need', 3)
      when a.bonus_need is not null then jsonb_build_object('have', (select count(*) from event_qualifications q
        join achievements x on x.key = q.achievement_key
        where q.user_id = me and x.event_key = e.key and x.week = a.week and x.bonus_need is null), 'need', a.bonus_need)
    end)
    order by a.week desc nulls last, a.sort_order), '[]'::jsonb)
  into list
  from achievements a left join biome_items i on i.key = a.reward_item
  where a.event_key = e.key and (a.drops_at is null or a.drops_at <= now());

  return jsonb_build_object('key', e.key, 'name', e.name, 'tagline', e.tagline, 'status', status, 'biome', e.biome,
    'featured', (select coalesce(jsonb_agg(x order by x.featured_at desc), '[]'::jsonb) from (
      select p.id, p.title, p.category, p.created_at, p.featured_at, u.username,
             (select count(*) from comments c where c.post_id = p.id and c.held_at is null) as comments
      from posts p join profiles u on u.id = p.user_id
      where p.event_key = e.key and p.featured_at is not null and p.held_at is null) x),
    'posts', (select coalesce(jsonb_agg(x order by x.created_at desc), '[]'::jsonb) from (
      select p.id, p.title, p.category, p.created_at, u.username,
             (select count(*) from comments c where c.post_id = p.id and c.held_at is null) as comments
      from posts p join profiles u on u.id = p.user_id
      where p.event_key = e.key and p.featured_at is null and p.held_at is null
      order by p.created_at desc limit 30) x),
    'starts_at', e.starts_at, 'ends_at', e.ends_at, 'grace_until', e.grace_until,
    'badge_image', e.badge_image, 'story_post_id', e.story_post_id, 'achievements', list,
    'calendar', case when me is not null and e.calendar and status = 'live' then
      daily_calendar(me) || jsonb_build_object('opened_today',
        exists (select 1 from daily_gifts g where g.user_id = me and g.day = byome_today())) end);
end $$;
grant execute on function public.event_overview(text) to anon, authenticated;


-- ---------- Anything already done today counts ----------
do $$
declare r record;
begin
  if not cc_during(now()) then return; end if;
  for r in select distinct user_id from biome_slots where pot_key = 'christmas-tree' loop
    perform cc_qualify(r.user_id, 'cc-trim-the-tree');
  end loop;
  for r in select distinct c.user_id from comments c, events e
           where e.key = 'christmas-2026' and c.created_at between e.starts_at and e.ends_at loop
    perform cc_check_cheer(r.user_id);
  end loop;
  for r in select r2.referred_id from referrals r2 where cc_during(r2.created_at) loop
    perform cc_check_secret_santa(r.referred_id);
  end loop;
end $$;

-- Prizes added since this file was first run go to everyone who already
-- did the challenge
select public.release_event_reward(key, reward_item) from public.achievements
where event_key = 'christmas-2026' and reward_item is not null
  and exists (select 1 from public.event_qualifications q where q.achievement_key = achievements.key);

-- Tell the API about the changes straight away
notify pgrst, 'reload schema';

select key, name, starts_at at time zone 'America/Chicago' as starts_central,
       ends_at at time zone 'America/Chicago' as ends_central,
       grace_until at time zone 'America/Chicago' as finishing_until_central
from public.events where key = 'christmas-2026';
