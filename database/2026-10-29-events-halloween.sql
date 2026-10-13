-- =========================================================
-- Byome: events, and the first one: Haunted Harvest (Halloween 2026).
--
--  Haunted Harvest runs Oct 15, 2026 12:00 am Central to Nov 1, 2026
--  11:59 pm Central (2026-10-15 05:00 UTC to 2026-11-02 05:59 UTC).
--  Things started during the event can still be finished until Nov 15,
--  11:59 pm Central (2026-11-16 05:59 UTC): friends finishing their
--  first post and review, poll votes, suggestion approvals.
--  Nothing here does anything before the start: the achievements stay
--  hidden, the review checkboxes don't show and nothing can be earned.
--
--  Eight achievements, 25 Byome points each (Harvest Moon: 50):
--   Dusting off the Cobwebs   a review of a product you've stopped using
--   Pumpkin Spice and Everything   a review of a fall/seasonal product
--   Beauty Horror Story       a comment (50+ characters) on the pinned post
--   Fresh Blood               3 product suggestions approved
--   Friendly Ghost            2 friends who joined during the event make a
--                             post and a review
--   Bait the Trap             a poll that gets votes from 5 members
--   Back from the Dead        an update (50+ characters) on a review that's
--                             at least 3 days old
--   Harvest Moon              any 5 of the 7 above
--  Each achievement only pays out once its reward item exists. Anyone who
--  qualifies before then gets it (and the points) when the item is added
--  with release_event_reward() below.
--
-- Run in the Supabase SQL Editor. Safe to run again. Paste the whole file
-- with nothing highlighted.
--
-- Handy lines (SQL Editor):
--  * On the 15th, after posting the horror stories thread (this also pins it):
--      select public.set_event_story_post('halloween-2026', 'paste the post link here');
--  * When a reward item's art is in (I'll add the item; this hands it out):
--      select public.release_event_reward('hh-bait-the-trap', 'venus-flytrap');
--  * Rename the event:
--      update events set name = 'New name' where key = 'halloween-2026';
-- =========================================================


-- ---------- Events ----------
create table if not exists public.events (
  key text primary key check (key ~ '^[a-z0-9-]+$'),
  name text not null,
  tagline text,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  grace_until timestamptz not null,   -- things started during the event can be finished until then
  story_post_id uuid references public.posts(id) on delete set null,
  badge_image text,                   -- the event's badge, shown on its achievements
  biome text,                         -- the biome its Events page is shown in
  created_at timestamptz not null default now(),
  check (ends_at > starts_at and grace_until >= ends_at)
);
alter table public.events add column if not exists biome text;
alter table public.events enable row level security;
drop policy if exists "Anyone can see events" on public.events;
create policy "Anyone can see events" on public.events for select using (true);

insert into public.events (key, name, tagline, starts_at, ends_at, grace_until, badge_image)
values ('halloween-2026', 'Haunted Harvest',
        'Dust off your shelf, share a beauty horror story and grow something spooky.',
        '2026-10-15 05:00:00+00', '2026-11-02 05:59:00+00', '2026-11-16 05:59:00+00',
        'biome-assets/event-halloween-2026.png')
on conflict (key) do nothing;
update public.events set biome = 'autumn' where key = 'halloween-2026' and biome is null;

create or replace function public.halloween() returns public.events
language sql stable security definer set search_path to public as $$
  select * from events where key = 'halloween-2026'
$$;
revoke execute on function public.halloween() from public, anon, authenticated;


-- ---------- Event achievements ----------
alter table public.achievements add column if not exists event_key text references public.events(key);
alter table public.achievements add column if not exists how_to text;
alter table public.achievements add column if not exists event_points int;

-- Event achievements stay hidden until their event starts
drop policy if exists "Anyone can see the achievements" on public.achievements;
create policy "Anyone can see the achievements" on public.achievements for select using (
  event_key is null or exists (select 1 from public.events e where e.key = event_key and e.starts_at <= now()));

-- Who has done what an event asks (the achievement itself is given once
-- its reward exists)
create table if not exists public.event_qualifications (
  user_id uuid not null references public.profiles(id) on delete cascade,
  achievement_key text not null references public.achievements(key),
  qualified_at timestamptz not null default now(),
  primary key (user_id, achievement_key)
);
alter table public.event_qualifications enable row level security;
revoke all on public.event_qualifications from anon, authenticated;

insert into public.point_rules (action, community_points, biome_points, delay_hours, label, notify)
values ('event_achievement', 0, 0, 0, 'Event achievement', false)
on conflict (action) do nothing;


-- ---------- New things for shelves ----------
-- Shelf decorations: drawn over the whole shelf, behind the pots
alter table public.biome_items drop constraint if exists biome_items_kind_check;
alter table public.biome_items add constraint biome_items_kind_check
  check (kind in ('pot', 'plant', 'shelf', 'biome', 'companion', 'shelf_overlay'));
alter table public.biome_items drop constraint if exists biome_items_check;
alter table public.biome_items add constraint biome_items_check check (
  (kind in ('shelf', 'biome', 'shelf_overlay') and size is null)
  or (kind in ('pot', 'plant') and size is not null)
  or kind = 'companion');
-- Limited-time shop items
alter table public.biome_items add column if not exists available_from timestamptz;
alter table public.biome_items add column if not exists available_until timestamptz;

-- The Autumn woodland biome: in the Byome Shop from the start of Haunted
-- Harvest, then all year round
insert into public.biome_items (key, kind, size, name, description, rarity, price, image, sort_order, max_per_member, available_from)
values ('autumn', 'biome', null, 'Autumn woodland',
        'Golden light through the trees, deepening to maple red, with leaves drifting down.',
        'uncommon', 300, '', 7, 1, '2026-10-15 05:00:00+00')
on conflict (key) do nothing;

alter table public.profiles add column if not exists shelf_overlay text references public.biome_items(key);

insert into public.biome_items (key, kind, size, name, description, rarity, price, image, sort_order, max_per_member)
values
  ('cobwebs', 'shelf_overlay', null, 'Cobwebs',
   'Someone has moved in. A souvenir from Haunted Harvest 2026.',
   'uncommon', null, 'biome-assets/overlay-cobwebs.webp', 1, 1),
  ('ghost-shelf', 'shelf', null, 'Haunted shelf',
   'A friendly crowd. A souvenir from Haunted Harvest 2026.',
   'rare', null, 'biome-assets/shelf-ghost.webp', 3, 1)
on conflict (key) do nothing;

create or replace function public.set_shelf_overlay(p_key text default null) returns void
language plpgsql security definer set search_path to public as $$
declare me uuid := auth.uid();
begin
  if me is null then raise exception 'Please log in first'; end if;
  if p_key is not null then
    if not exists (select 1 from biome_items where key = p_key and kind = 'shelf_overlay') then
      raise exception 'That isn''t a shelf decoration';
    end if;
    if not exists (select 1 from biome_inventory where user_id = me and item_key = p_key) then
      raise exception 'You don''t have that one yet';
    end if;
  end if;
  update profiles set shelf_overlay = p_key where id = me;
end $$;
revoke execute on function public.set_shelf_overlay(text) from public, anon;
grant execute on function public.set_shelf_overlay(text) to authenticated;

-- Buying (the same as before, plus limited-time windows)
create or replace function public.buy_biome_item(p_key text) returns jsonb
language plpgsql security definer set search_path to public as $$
declare
  me uuid := auth.uid();
  item biome_items%rowtype;
  balance int;
  new_id uuid;
  new_sold int;
begin
  if me is null then raise exception 'Please log in first'; end if;

  -- One purchase at a time per member, so the same points can't be spent twice
  perform pg_advisory_xact_lock(hashtext('biome-buy'), hashtext(me::text));
  -- and one at a time per item, so a limited edition can't oversell
  select * into item from biome_items where key = p_key for update;

  if not found or not item.available or item.price is null then raise exception 'That item isn''t for sale'; end if;
  if (item.available_from is not null and now() < item.available_from)
     or (item.available_until is not null and now() > item.available_until) then
    raise exception 'That item isn''t in the shop right now';
  end if;
  if item.starter then raise exception 'Everyone already has that one'; end if;
  if item.max_supply is not null and item.sold >= item.max_supply then raise exception 'Sorry, that one is sold out'; end if;
  if item.kind in ('shelf', 'shelf_overlay') and exists (select 1 from biome_inventory where user_id = me and item_key = p_key) then
    raise exception 'You already own that one';
  end if;
  if item.max_per_member is not null
     and (select count(*) from biome_inventory where user_id = me and item_key = p_key) >= item.max_per_member then
    raise exception 'That one is limited to % per member, and you already have it', item.max_per_member;
  end if;

  select coalesce(sum(biome_points), 0) into balance from point_ledger
  where user_id = me and revoked_at is null and biome_available_at <= now();
  if balance < item.price then raise exception 'Not enough Byome points yet'; end if;

  update biome_items set sold = sold + 1 where key = p_key returning sold into new_sold;
  insert into biome_inventory (user_id, item_key, serial, source)
  values (me, p_key, case when item.max_supply is not null then new_sold end, 'shop')
  returning id into new_id;
  insert into point_ledger (user_id, action, community_points, biome_points, ref_type, ref_id)
  values (me, 'biome_purchase', 0, -item.price, 'biome_item', new_id);

  return jsonb_build_object(
    'serial', case when item.max_supply is not null then new_sold end,
    'balance', balance - item.price);
end $$;


-- ---------- The Haunted Harvest achievements ----------
insert into public.achievements (key, name, description, how_to, reward_item, event_key, event_points, sort_order) values
  ('hh-cobwebs', 'Dusting off the Cobwebs',
   'Reviewed a product you''ve stopped using, during Haunted Harvest 2026.',
   'What''s gathering dust on your shelf? Review a product you''ve stopped using and tick "I no longer use this." Any rating counts.',
   'cobwebs', 'halloween-2026', 25, 30),
  ('hh-pumpkin-spice', 'Pumpkin Spice and Everything',
   'Reviewed a fall favorite, during Haunted Harvest 2026.',
   'Review a product you save for autumn and tick "This is a fall or seasonal product." Fall scents or not, it''s your call.',
   null, 'halloween-2026', 25, 31),
  ('hh-horror-story', 'Beauty Horror Story',
   'Shared a beauty horror story, during Haunted Harvest 2026.',
   'Share your beauty horror story (or just the weirdest thing that''s happened to you) in the pinned post in Just for Fun. At least 50 characters. Stories about products and experiences only: please don''t name or target anyone.',
   null, 'halloween-2026', 25, 32),
  ('hh-fresh-blood', 'Fresh Blood',
   'Had 3 product suggestions approved, during Haunted Harvest 2026.',
   'Get 3 product suggestions approved. Anything you suggest before the event ends counts, even if it''s approved afterwards.',
   null, 'halloween-2026', 25, 33),
  ('hh-friendly-ghost', 'Friendly Ghost',
   'Brought 2 friends to Byome, during Haunted Harvest 2026.',
   'Invite 2 friends who join during the event. Each counts once they''ve made a post and written a review (they have until Nov 15).',
   'ghost-shelf', 'halloween-2026', 25, 34),
  ('hh-bait-the-trap', 'Bait the Trap',
   'Made a poll that 5 members voted in, during Haunted Harvest 2026.',
   'Start a poll in the Community during the event and get votes from 5 other members (votes count until Nov 15).',
   null, 'halloween-2026', 25, 35),
  ('hh-back-from-the-dead', 'Back from the Dead',
   'Brought an old review back to life, during Haunted Harvest 2026.',
   'Use "Add update" on one of your reviews that''s at least 3 days old. At least 50 characters.',
   null, 'halloween-2026', 25, 36),
  ('hh-harvest-moon', 'Harvest Moon',
   'Completed 5 Haunted Harvest 2026 achievements.',
   'Complete any 5 of the 7 achievements above.',
   null, 'halloween-2026', 50, 37)
on conflict (key) do update set
  name = excluded.name, description = excluded.description, how_to = excluded.how_to,
  event_key = excluded.event_key, event_points = excluded.event_points, sort_order = excluded.sort_order,
  reward_item = coalesce(public.achievements.reward_item, excluded.reward_item);


-- ---------- Earning them ----------
-- Giving an achievement (the same as before; the reward line now reads
-- "Your reward: Cobwebs." so names like Cobwebs read naturally)
create or replace function public.grant_achievement(p_user uuid, p_key text) returns boolean
language plpgsql security definer set search_path to public as $$
declare
  a achievements%rowtype;
  it biome_items%rowtype;
  default_pot text;
  free_spot int;
  msg text;
begin
  insert into user_achievements (user_id, achievement_key) values (p_user, p_key)
  on conflict do nothing;
  if not found then return false; end if;  -- already had it

  select * into a from achievements where key = p_key;
  msg := 'You earned the "' || a.name || '" achievement!';

  if a.reward_item is not null then
    select * into it from biome_items where key = a.reward_item;
    insert into biome_inventory (user_id, item_key, source) values (p_user, it.key, 'achievement');
    msg := msg || ' Your reward: ' || it.name || '.';

    if it.kind = 'plant' then
      select key into default_pot from biome_items
      where kind = 'pot' and starter and size = it.size order by sort_order limit 1;
      select min(s) into free_spot
      from generate_series(case when it.size = 'small' then 0 else 8 end,
                           case when it.size = 'small' then 7 else 10 end) s
      where not exists (select 1 from biome_slots where user_id = p_user and slot = s);
      if default_pot is not null and free_spot is not null then
        insert into biome_slots (user_id, slot, pot_key, plant_key) values (p_user, free_spot, default_pot, it.key);
        msg := msg || ' It''s already on your shelf.';
      end if;
    end if;
  end if;

  perform create_notification(p_user, null, 'achievement', null, msg, 'profile.html');
  return true;
end $$;
revoke execute on function public.grant_achievement(uuid, text) from public, anon, authenticated;

-- Gives an event achievement, its reward and its points, if its reward exists
create or replace function public.event_try_grant(p_user uuid, p_key text) returns boolean
language plpgsql security definer set search_path to public as $$
declare
  a achievements%rowtype;
  new_id uuid;
begin
  select * into a from achievements where key = p_key;
  if a.reward_item is null then return false; end if;
  if not grant_achievement(p_user, p_key) then return false; end if;
  insert into point_ledger (user_id, action, community_points, biome_points, ref_type, ref_id)
  values (p_user, 'event_achievement', 0, coalesce(a.event_points, 0), 'achievement', md5(p_key)::uuid)
  on conflict (user_id, action, ref_id) where revoked_at is null and ref_id is not null do nothing
  returning id into new_id;
  if new_id is not null and coalesce(a.event_points, 0) > 0 then
    perform create_notification(p_user, null, 'points', new_id,
      'You earned ' || a.event_points || ' Byome points for "' || a.name || '"!', 'events.html');
  end if;
  return true;
end $$;
revoke execute on function public.event_try_grant(uuid, text) from public, anon, authenticated;

-- Records that a member did what an event achievement asks (once), pays out
-- if its reward is ready, and checks Harvest Moon
create or replace function public.event_qualify(p_user uuid, p_key text) returns void
language plpgsql security definer set search_path to public as $$
declare
  a achievements%rowtype;
  e events%rowtype;
  done int;
begin
  select * into a from achievements where key = p_key;
  select * into e from events where key = a.event_key;
  if e.key is null or now() < e.starts_at or now() > e.grace_until then return; end if;
  if exists (select 1 from profiles where id = p_user and deleted_at is not null) then return; end if;

  insert into event_qualifications (user_id, achievement_key) values (p_user, p_key) on conflict do nothing;
  if not found then return; end if;

  if not event_try_grant(p_user, p_key) then
    perform create_notification(p_user, null, 'achievement', null,
      'You completed "' || a.name || '"! Its reward is still being made, and it''ll be yours (with your '
        || coalesce(a.event_points, 0) || ' Byome points) as soon as it''s ready.', 'events.html');
  end if;

  if p_key <> 'hh-harvest-moon' and e.key = 'halloween-2026' then
    select count(*) into done from event_qualifications q join achievements x on x.key = q.achievement_key
    where q.user_id = p_user and x.event_key = 'halloween-2026' and x.key <> 'hh-harvest-moon';
    if done >= 5 then perform event_qualify(p_user, 'hh-harvest-moon'); end if;
  end if;
end $$;
revoke execute on function public.event_qualify(uuid, text) from public, anon, authenticated;

-- When a reward's art is ready: attach it and pay everyone who already qualified
create or replace function public.release_event_reward(p_achievement text, p_item text) returns text
language plpgsql security definer set search_path to public as $$
declare
  r record;
  n int := 0;
begin
  if not exists (select 1 from biome_items where key = p_item) then return 'There''s no item "' || p_item || '" yet.'; end if;
  update achievements set reward_item = p_item where key = p_achievement and event_key is not null;
  if not found then return 'There''s no event achievement "' || p_achievement || '".'; end if;
  for r in select user_id from event_qualifications where achievement_key = p_achievement loop
    if event_try_grant(r.user_id, p_achievement) then n := n + 1; end if;
  end loop;
  return 'Done: ' || n || ' member' || case when n = 1 then '' else 's' end || ' who already qualified got it.';
end $$;
revoke execute on function public.release_event_reward(text, text) from public, anon, authenticated;

-- Text length for the event's 50-character rules: trimmed, and at most 2
-- emojis count (each as 1 character); skin tones and joiners don't count
create or replace function public.event_text_length(p_text text) returns int
language plpgsql immutable set search_path to public as $$
declare
  t text := btrim(coalesce(p_text, ''), E' \t\r\n');
  emojis int;
begin
  t := regexp_replace(t, '[️‍\U0001F3FB-\U0001F3FF\U000E0020-\U000E007F]', '', 'g');
  emojis := length(t) - length(regexp_replace(t, '[\U0001F000-\U0001FAFF☀-➿⌀-⏿⬀-⯿]', '', 'g'));
  return length(t) - emojis + least(emojis, 2);
end $$;


-- Reviews: two checkboxes, and Cobwebs / Pumpkin Spice
alter table public.reviews add column if not exists no_longer_using boolean not null default false;
alter table public.reviews add column if not exists seasonal boolean not null default false;

-- Friendly Ghost: does this member's inviter now have 2 finished friends?
create or replace function public.event_check_friendly_ghost(p_referee uuid) returns void
language plpgsql security definer set search_path to public as $$
declare
  e events := halloween();
  inviter uuid;
  finished int;
begin
  select referrer_id into inviter from referrals
  where referred_id = p_referee and created_at between e.starts_at and e.ends_at;
  if inviter is null then return; end if;
  select count(*) into finished from referrals r
  where r.referrer_id = inviter and r.created_at between e.starts_at and e.ends_at
    and exists (select 1 from posts p where p.user_id = r.referred_id and p.held_at is null)
    and exists (select 1 from reviews v where v.user_id = r.referred_id and v.held_at is null);
  if finished >= 2 then perform event_qualify(inviter, 'hh-friendly-ghost'); end if;
end $$;
revoke execute on function public.event_check_friendly_ghost(uuid) from public, anon, authenticated;

create or replace function public.event_on_review() returns trigger
language plpgsql security definer set search_path to public as $$
declare e events := halloween();
begin
  if new.held_at is not null or e.key is null then return new; end if;
  if new.created_at between e.starts_at and e.ends_at then
    if new.no_longer_using then perform event_qualify(new.user_id, 'hh-cobwebs'); end if;
    if new.seasonal then perform event_qualify(new.user_id, 'hh-pumpkin-spice'); end if;
  end if;
  perform event_check_friendly_ghost(new.user_id);
  return new;
end $$;
drop trigger if exists event_after_review on public.reviews;
create trigger event_after_review after insert or update of held_at, no_longer_using, seasonal on public.reviews
  for each row execute function public.event_on_review();

create or replace function public.event_on_post() returns trigger
language plpgsql security definer set search_path to public as $$
begin
  if new.held_at is null then perform event_check_friendly_ghost(new.user_id); end if;
  return new;
end $$;
drop trigger if exists event_after_post on public.posts;
create trigger event_after_post after insert or update of held_at on public.posts
  for each row execute function public.event_on_post();

-- Beauty Horror Story: a comment on the event's pinned post
create or replace function public.event_on_comment() returns trigger
language plpgsql security definer set search_path to public as $$
declare e events := halloween();
begin
  if new.held_at is null and e.story_post_id is not null and new.post_id = e.story_post_id
     and new.created_at between e.starts_at and e.ends_at
     and event_text_length(new.body) >= 50 then
    perform event_qualify(new.user_id, 'hh-horror-story');
  end if;
  return new;
end $$;
drop trigger if exists event_after_comment on public.comments;
create trigger event_after_comment after insert or update of held_at, body on public.comments
  for each row execute function public.event_on_comment();

-- Fresh Blood: 3 suggestions submitted during the event, approved
create or replace function public.event_on_product() returns trigger
language plpgsql security definer set search_path to public as $$
declare e events := halloween();
begin
  if new.status = 'approved' and old.status is distinct from 'approved' and new.suggested_by is not null
     and (select count(*) from products p where p.suggested_by = new.suggested_by and p.status = 'approved'
          and p.created_at between e.starts_at and e.ends_at) >= 3 then
    perform event_qualify(new.suggested_by, 'hh-fresh-blood');
  end if;
  return new;
end $$;
drop trigger if exists event_after_product on public.products;
create trigger event_after_product after update of status on public.products
  for each row execute function public.event_on_product();

-- Bait the Trap: a poll made during the event, voted in by 5 other members
create or replace function public.event_on_vote() returns trigger
language plpgsql security definer set search_path to public as $$
declare
  e events := halloween();
  creator uuid;
begin
  select p.user_id into creator from posts p join polls pl on pl.post_id = p.id
  where p.id = new.post_id and p.held_at is null and pl.created_at between e.starts_at and e.ends_at;
  if creator is not null
     and (select count(distinct v.user_id) from poll_votes v where v.post_id = new.post_id and v.user_id <> creator) >= 5 then
    perform event_qualify(creator, 'hh-bait-the-trap');
  end if;
  return new;
end $$;
drop trigger if exists event_after_vote on public.poll_votes;
create trigger event_after_vote after insert on public.poll_votes
  for each row execute function public.event_on_vote();

-- Back from the Dead: an update on a review that's at least 3 days old
create or replace function public.event_on_review_update() returns trigger
language plpgsql security definer set search_path to public as $$
declare e events := halloween();
begin
  if new.held_at is null and new.created_at between e.starts_at and e.ends_at
     and event_text_length(new.body) >= 50
     and exists (select 1 from reviews r where r.id = new.review_id and r.user_id = new.user_id
                 and new.created_at - r.created_at >= interval '3 days') then
    perform event_qualify(new.user_id, 'hh-back-from-the-dead');
  end if;
  return new;
end $$;
drop trigger if exists event_after_review_update on public.review_updates;
create trigger event_after_review_update after insert or update of held_at on public.review_updates
  for each row execute function public.event_on_review_update();


-- ---------- Pinned posts (moderators only) ----------
alter table public.posts add column if not exists pinned_at timestamptz;

-- Only moderators (through set_post_pinned) can pin; everyone else's
-- changes to it are refused, and new posts can't start pinned
create or replace function public.lock_post_fields() returns trigger
language plpgsql set search_path to public as $$
begin
  if new.user_id is distinct from old.user_id
     or new.created_at is distinct from old.created_at then
    raise exception 'That part of a post can''t be changed';
  end if;
  if new.pinned_at is distinct from old.pinned_at
     and coalesce(current_setting('byome.pinning', true), '') <> 'on' then
    raise exception 'Only moderators can pin posts';
  end if;
  return new;
end $$;

create or replace function public.posts_start_unpinned() returns trigger
language plpgsql set search_path to public as $$
begin
  new.pinned_at := null;
  return new;
end $$;
drop trigger if exists posts_start_unpinned on public.posts;
create trigger posts_start_unpinned before insert on public.posts
  for each row execute function public.posts_start_unpinned();

create or replace function public.set_post_pinned(p_post uuid, p_pinned boolean) returns void
language plpgsql security definer set search_path to public as $$
begin
  if auth.uid() is not null and not is_moderator() then raise exception 'Only moderators can pin posts'; end if;
  perform set_config('byome.pinning', 'on', true);
  update posts set pinned_at = case when p_pinned then now() end where id = p_post;
  perform set_config('byome.pinning', 'off', true);
end $$;
revoke execute on function public.set_post_pinned(uuid, boolean) from public, anon;
grant execute on function public.set_post_pinned(uuid, boolean) to authenticated;

-- The event's horror stories thread: paste the post's link (or its id).
-- It's pinned too. (SQL Editor only.)
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
  perform set_post_pinned(pid, true);
  return 'Done: "' || t || '" is the event''s horror stories post, and it''s pinned.';
end $$;
revoke execute on function public.set_event_story_post(text, text) from public, anon, authenticated;


-- ---------- The Events page ----------
-- An event, its achievements, the rewards, and (logged in) your progress.
-- Before the start it only says when it begins.
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
    end)
    order by a.sort_order), '[]'::jsonb)
  into list
  from achievements a left join biome_items i on i.key = a.reward_item
  where a.event_key = e.key;

  return jsonb_build_object('key', e.key, 'name', e.name, 'tagline', e.tagline, 'status', status, 'biome', e.biome,
    'starts_at', e.starts_at, 'ends_at', e.ends_at, 'grace_until', e.grace_until,
    'badge_image', e.badge_image, 'story_post_id', e.story_post_id, 'achievements', list);
end $$;
grant execute on function public.event_overview(text) to anon, authenticated;


-- Tell the API about the new functions straight away
notify pgrst, 'reload schema';

select key, name, starts_at at time zone 'America/Chicago' as starts_central,
       ends_at at time zone 'America/Chicago' as ends_central,
       grace_until at time zone 'America/Chicago' as finishing_until_central
from public.events;
