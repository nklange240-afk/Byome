-- =========================================================
-- Byome: falling leaves. Now and then, while a member is using the site,
-- a leaf drifts across the screen; catching it gives a prize. Built to be
-- reused: each season can have its own "drifter" (a leaf now, maybe a
-- snowflake in winter), with its own dates, picture, daily limit and prizes.
--
-- The database decides everything, so nobody can award themselves prizes
-- from their browser:
--   - drifter_appear() is asked now and then by the page. If a drifter is
--     on, the member hasn't hit today's limit and hasn't seen one in the
--     last few minutes, it says "show one" and remembers that it did.
--   - drifter_catch() checks it's that member's own leaf, caught in time
--     and not already caught, then draws the prize here.
--
-- The first drifter: the Falling leaf, from Nov 2 until the Christmas event
-- begins (Nov 27), at most 3 caught a day (Central time), with at least
-- 2 minutes between leaves (the page looks every 2 to 5 minutes). Its prizes start
-- as Byome points only; add items once their art is ready:
--   insert into drifter_prizes (drifter_key, item_key, weight)
--   values ('falling-leaf', 'item-key', 10);
-- (an item a member already owns is skipped for them, so they get points
-- instead). Weights are relative: the points prizes are 5 (weight 50),
-- 10 (35) and 15 (15), adding up to 100, so an item with weight 10 comes up
-- about 1 catch in 11. Only caught leaves count towards the daily limit;
-- one that drifts past uncaught doesn't.
-- Other handy changes:
--   update drifters set daily_cap = 4 where key = 'falling-leaf';
--   update drifters set ends_at = '2026-11-27 06:00+00' where key = 'falling-leaf';
--
-- Run in the Supabase SQL Editor. Safe to run again. Paste the whole file
-- with nothing highlighted. Needs 2026-11-26-daily-surprise.sql first.
-- =========================================================

-- What can drift by, and when
create table if not exists public.drifters (
  key text primary key,
  name text not null,                         -- e.g. "falling leaf"
  image text not null,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  daily_cap integer not null default 3,       -- catches per member per day
  min_gap_minutes integer not null default 2, -- at least this long between appearances
  catch_seconds integer not null default 60   -- how long a member has to catch it
);
alter table public.drifters enable row level security;
drop policy if exists "Anyone can see drifters" on public.drifters;
create policy "Anyone can see drifters" on public.drifters for select using (true);

-- What catching one can give: Byome points, or an item
create table if not exists public.drifter_prizes (
  id uuid primary key default gen_random_uuid(),
  drifter_key text not null references public.drifters(key) on delete cascade,
  item_key text references public.biome_items(key),
  points integer not null default 0,
  weight integer not null check (weight > 0),
  check ((item_key is null and points > 0) or (item_key is not null and points = 0))
);
alter table public.drifter_prizes enable row level security;

-- Each time one was shown to a member, and whether they caught it
create table if not exists public.drifter_sightings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  drifter_key text not null references public.drifters(key) on delete cascade,
  day date not null,
  shown_at timestamptz not null default now(),
  caught_at timestamptz,
  points integer not null default 0,
  item_key text references public.biome_items(key)
);
create index if not exists drifter_sightings_user_day on public.drifter_sightings (user_id, day);
alter table public.drifter_sightings enable row level security;
drop policy if exists "See your own sightings" on public.drifter_sightings;
create policy "See your own sightings" on public.drifter_sightings for select to authenticated
  using (user_id = (select auth.uid()));

-- Points and items from catches are marked as such
insert into public.point_rules (action, label, community_points, biome_points, notify, description) values
  ('drifter_catch', 'Caught a falling leaf', 0, 0, false, 'Catching something drifting across the screen (the amount varies).')
on conflict (action) do nothing;
alter table public.biome_inventory drop constraint if exists biome_inventory_source_check;
alter table public.biome_inventory add constraint biome_inventory_source_check
  check (source in ('shop', 'achievement', 'gift', 'daily', 'drifter'));

-- The first one: the Falling leaf, between Haunted Harvest and Christmas
insert into public.drifters (key, name, image, starts_at, ends_at, daily_cap, min_gap_minutes, catch_seconds)
values ('falling-leaf', 'falling leaf', 'biome-assets/drifter-falling-leaf.png',
        '2026-11-02 06:00+00', '2026-11-27 06:00+00', 3, 2, 60)
on conflict (key) do nothing;
insert into public.drifter_prizes (drifter_key, points, weight)
select 'falling-leaf', p, w from (values (5, 50), (10, 35), (15, 15)) as v(p, w)
where not exists (select 1 from public.drifter_prizes where drifter_key = 'falling-leaf');

-- Should one drift by now? Returns what to show, or null
create or replace function public.drifter_appear() returns jsonb
language plpgsql security definer set search_path to public as $$
declare
  me uuid := auth.uid();
  d drifters%rowtype;
  s drifter_sightings%rowtype;
begin
  if me is null then return null; end if;
  if not exists (select 1 from profiles where id = me and deleted_at is null) then return null; end if;
  select * into d from drifters where now() >= starts_at and now() < ends_at order by starts_at desc limit 1;
  if not found then return null; end if;
  -- one at a time per member, so two open tabs can't both get one
  perform pg_advisory_xact_lock(hashtext('drifter'), hashtext(me::text));
  if (select count(*) from drifter_sightings where user_id = me and day = byome_today() and caught_at is not null) >= d.daily_cap then
    return null;
  end if;
  if exists (select 1 from drifter_sightings where user_id = me and shown_at > now() - make_interval(mins => d.min_gap_minutes)) then
    return null;
  end if;
  insert into drifter_sightings (user_id, drifter_key, day) values (me, d.key, byome_today()) returning * into s;
  return jsonb_build_object('id', s.id, 'name', d.name, 'image', d.image, 'seconds', d.catch_seconds);
end $$;
revoke execute on function public.drifter_appear() from public, anon;
grant execute on function public.drifter_appear() to authenticated;

-- Caught it! Draws and gives the prize
create or replace function public.drifter_catch(p_id uuid) returns jsonb
language plpgsql security definer set search_path to public as $$
declare
  me uuid := auth.uid();
  s drifter_sightings%rowtype;
  d drifters%rowtype;
  prize drifter_prizes%rowtype;
  caught_today integer;
begin
  if me is null then raise exception 'Please log in first'; end if;
  perform pg_advisory_xact_lock(hashtext('drifter'), hashtext(me::text));
  select * into s from drifter_sightings where id = p_id and user_id = me;
  if not found then raise exception 'That one isn''t yours to catch'; end if;
  if s.caught_at is not null then raise exception 'You already caught that one'; end if;
  select * into d from drifters where key = s.drifter_key;
  if now() > s.shown_at + make_interval(secs => d.catch_seconds) then
    raise exception 'Too late, it drifted away! Another will come by.';
  end if;
  select count(*) into caught_today from drifter_sightings
  where user_id = me and day = s.day and caught_at is not null;
  if caught_today >= d.daily_cap then raise exception 'That''s all for today. Come back tomorrow!'; end if;

  -- The prize: weighted at random, skipping items they already own
  select p.* into prize from drifter_prizes p
  left join biome_items i on i.key = p.item_key
  where p.drifter_key = d.key
    and (p.item_key is null
         or (i.available and not exists (select 1 from biome_inventory v where v.user_id = me and v.item_key = p.item_key)))
  order by -ln(1 - random()) / p.weight
  limit 1;
  if not found then prize.points := 5; end if;

  update drifter_sightings set caught_at = now(), points = coalesce(prize.points, 0), item_key = prize.item_key
  where id = s.id;
  if prize.item_key is not null then
    insert into biome_inventory (user_id, item_key, source) values (me, prize.item_key, 'drifter');
  else
    insert into point_ledger (user_id, action, community_points, biome_points, ref_type, ref_id)
    values (me, 'drifter_catch', 0, prize.points, 'drifter_sighting', s.id);
  end if;

  return jsonb_build_object(
    'name', d.name,
    'points', coalesce(prize.points, 0),
    'left_today', d.daily_cap - caught_today - 1,
    'item', (select jsonb_build_object('key', i.key, 'name', i.name, 'image', i.image, 'kind', i.kind,
                                       'size', i.size, 'rarity', i.rarity, 'over_pot', i.over_pot)
             from biome_items i where i.key = prize.item_key));
end $$;
revoke execute on function public.drifter_catch(uuid) from public, anon;
grant execute on function public.drifter_catch(uuid) to authenticated;

-- Tell the API about the new functions straight away
notify pgrst, 'reload schema';
