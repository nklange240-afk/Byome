-- =========================================================
-- Byome: the daily surprise, event calendars, and a bonus for the first
-- review of the day.
--
-- DAILY SURPRISE: once a day (midnight to midnight, Central time) each
-- member picks one of three seed packets and shakes out a prize. The prize
-- is drawn here, by the database, at the moment the packet is opened, so
-- the packet's colour or position makes no difference.
--   20.5%  2-3 Byome points       1%    100 points
--   47%    4-6 points             0.25% 200 points
--   10%    10 points              10%   a common shop item (a new one 3 times
--    5%    20 points                    in 4, otherwise one they already have)
--    2.5%  30 points              2%    a rare daily-surprise exclusive
--    1.5%  50 points              0.5%  an heirloom daily-surprise exclusive
-- (until exclusives exist, those two give 50 and 150 points instead)
--
-- EVENT CALENDARS: during an event that has one (events.calendar = true),
-- each day's surprise also adds a stamp to the event's calendar (days don't
-- need to be in a row). Stamps 2, 4 and 6 give 15 bonus Byome points; stamp
-- 7 gives the event's calendar item (events.calendar_item), or 75 points if
-- it has none. The first calendar is planned for the Christmas event.
--
-- FIRST REVIEW OF THE DAY: 15 extra Byome points (25 in all) for each
-- member's first published review each day.
--
-- To add a daily-surprise exclusive once its art is ready:
--   insert into biome_items (key, kind, size, name, description, rarity, image, daily_exclusive)
--   values ('my-pot', 'pot', 'small', 'My pot', 'Only from the daily surprise.', 'rare', 'biome-assets/pot-my-pot.png', true);
-- To give an event a calendar (and its stamp-7 item):
--   update events set calendar = true, calendar_item = 'item-key' where key = 'event-key';
--
-- Run in the Supabase SQL Editor. Safe to run again. Paste the whole file
-- with nothing highlighted. Run it before publishing the site update that
-- came with it.
-- =========================================================

-- Items only the daily surprise gives, and each event's calendar prize
alter table public.biome_items add column if not exists daily_exclusive boolean not null default false;
alter table public.events add column if not exists calendar boolean not null default false;
alter table public.events add column if not exists calendar_item text references public.biome_items(key);

-- Items from the daily surprise are marked as such
alter table public.biome_inventory drop constraint if exists biome_inventory_source_check;
alter table public.biome_inventory add constraint biome_inventory_source_check
  check (source in ('shop', 'achievement', 'gift', 'daily'));

insert into public.point_rules (action, label, community_points, biome_points, notify, description) values
  ('daily_gift', 'Daily surprise', 0, 0, false, 'The daily surprise (the amount varies).'),
  ('event_calendar', 'Event calendar', 0, 15, false, 'Bonus stamps on an event calendar.'),
  ('daily_first_review', 'First review of the day', 0, 15, true, 'Extra Byome points for your first review each day.')
on conflict (action) do nothing;

create table if not exists public.daily_gifts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  day date not null,
  tier text not null,                 -- small, good, great, lucky, jackpot, item, rare, heirloom
  points integer not null default 0,
  item_key text references public.biome_items(key),
  duplicate boolean not null default false,
  event_key text references public.events(key),
  calendar_stamp integer,
  calendar_points integer not null default 0,
  calendar_item text references public.biome_items(key),
  created_at timestamptz not null default now(),
  unique (user_id, day)
);
create index if not exists daily_gifts_event_idx on public.daily_gifts (user_id, event_key) where event_key is not null;
alter table public.daily_gifts enable row level security;
drop policy if exists "See your own daily surprises" on public.daily_gifts;
create policy "See your own daily surprises" on public.daily_gifts for select to authenticated
  using (user_id = (select auth.uid()));

-- Today, in Central time (the same clock events use)
create or replace function public.byome_today() returns date
language sql stable as $$ select (now() at time zone 'America/Chicago')::date $$;

-- An item from a pool for the daily surprise: one they don't own yet when
-- there is one (3 times in 4 for commons, always for exclusives), otherwise
-- one they already have. Null if the pool is empty.
create or replace function public.daily_pick_item(p_user uuid, p_rarity text, p_exclusive boolean) returns text
language plpgsql volatile security definer set search_path to public as $$
declare
  k text;
  fresh_chance numeric := case when p_exclusive then 1 else 0.75 end;
begin
  if random() < fresh_chance then
    select i.key into k from biome_items i
    where i.rarity = p_rarity and i.available and not i.starter and i.daily_exclusive = p_exclusive
      and i.kind in ('pot', 'plant', 'companion')
      and (p_exclusive or (i.price is not null
           and (i.available_from is null or now() >= i.available_from)
           and (i.available_until is null or now() <= i.available_until)))
      and not exists (select 1 from biome_inventory v where v.user_id = p_user and v.item_key = i.key)
    order by random() limit 1;
    if k is not null then return k; end if;
  end if;
  select i.key into k from biome_items i
  where i.rarity = p_rarity and i.available and not i.starter and i.daily_exclusive = p_exclusive
    and i.kind in ('pot', 'plant', 'companion')
    and (p_exclusive or (i.price is not null
         and (i.available_from is null or now() >= i.available_from)
         and (i.available_until is null or now() <= i.available_until)))
  order by random() limit 1;
  return k;
end $$;
revoke execute on function public.daily_pick_item(uuid, text, boolean) from public, anon, authenticated;

-- What a daily gift row looks like to the page
create or replace function public.daily_gift_json(g daily_gifts) returns jsonb
language sql stable security definer set search_path to public as $$
  select jsonb_build_object(
    'tier', g.tier, 'points', g.points, 'duplicate', g.duplicate,
    'item', (select jsonb_build_object('key', i.key, 'name', i.name, 'image', i.image, 'kind', i.kind,
                                       'size', i.size, 'rarity', i.rarity, 'over_pot', i.over_pot)
             from biome_items i where i.key = g.item_key),
    'calendar_stamp', g.calendar_stamp, 'calendar_points', g.calendar_points,
    'calendar_item', (select jsonb_build_object('key', i.key, 'name', i.name, 'image', i.image, 'kind', i.kind,
                                                'size', i.size, 'rarity', i.rarity, 'over_pot', i.over_pot)
                      from biome_items i where i.key = g.calendar_item))
$$;
revoke execute on function public.daily_gift_json(daily_gifts) from public, anon, authenticated;

-- The calendar of whichever event is on, if it has one (null if not)
create or replace function public.daily_calendar(p_user uuid) returns jsonb
language sql stable security definer set search_path to public as $$
  select jsonb_build_object(
    'event_key', e.key, 'name', e.name, 'ends_at', e.ends_at, 'total', 7,
    'stamps', (select count(*) from daily_gifts g where g.user_id = p_user and g.event_key = e.key),
    'item', (select jsonb_build_object('key', i.key, 'name', i.name, 'image', i.image, 'kind', i.kind,
                                       'size', i.size, 'rarity', i.rarity, 'over_pot', i.over_pot)
             from biome_items i where i.key = e.calendar_item))
  from events e
  where e.calendar and now() >= e.starts_at and now() < e.ends_at
  order by e.starts_at desc limit 1
$$;
revoke execute on function public.daily_calendar(uuid) from public, anon, authenticated;

-- Has today's surprise been opened? (and the event calendar, if one is on)
create or replace function public.daily_gift_today() returns jsonb
language plpgsql stable security definer set search_path to public as $$
declare
  me uuid := auth.uid();
  g daily_gifts%rowtype;
begin
  if me is null then return null; end if;
  select * into g from daily_gifts where user_id = me and day = byome_today();
  return jsonb_build_object(
    'day', byome_today(),
    'claimed', found,
    'gift', case when found then daily_gift_json(g) end,
    'calendar', daily_calendar(me));
end $$;
revoke execute on function public.daily_gift_today() from public, anon;
grant execute on function public.daily_gift_today() to authenticated;

-- Open today's packet
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

  -- The event calendar
  select * into ev from events where calendar and now() >= starts_at and now() < ends_at order by starts_at desc limit 1;
  if found then
    g.event_key := ev.key;
    stamp := (select count(*) from daily_gifts where user_id = me and event_key = ev.key) + 1;
    if stamp <= 7 then
      g.calendar_stamp := stamp;
      if stamp in (2, 4, 6) then g.calendar_points := 15;
      elsif stamp = 7 then
        if ev.calendar_item is not null then g.calendar_item := ev.calendar_item; else g.calendar_points := 75; end if;
      end if;
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

-- "While you're here": a listed product nobody has reviewed yet
create or replace function public.daily_nudge() returns jsonb
language sql volatile security definer set search_path to public as $$
  select jsonb_build_object('id', p.id, 'brand', p.brand, 'name', p.name)
  from products p
  where p.status = 'approved'
    and not exists (select 1 from reviews r where r.product_id = p.id and r.held_at is null)
  order by random() limit 1
$$;
revoke execute on function public.daily_nudge() from public, anon;
grant execute on function public.daily_nudge() to authenticated;


-- ---------- First review of the day: 15 extra Byome points ----------
-- Same as before, plus the daily bonus (and it's taken back with the rest
-- if the review stops counting)
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
        -- the member's first review today (Central time)?
        if not exists (
          select 1 from point_ledger l
          where l.user_id = new.user_id and l.action = 'daily_first_review' and l.revoked_at is null
            and (l.created_at at time zone 'America/Chicago')::date = byome_today()
        ) then
          perform award_points(new.user_id, 'daily_first_review', 'review', new.id);
        end if;
      end if;
    end if;
  else
    update point_ledger set revoked_at = now()
    where ref_type = 'review' and ref_id = new.id and revoked_at is null
      and action in ('review', 'first_review', 'review_liked', 'review_update', 'review_standout', 'daily_first_review');
  end if;
  return new;
end $$;
