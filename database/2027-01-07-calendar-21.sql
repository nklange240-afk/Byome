-- =========================================================
-- Byome: the event calendar becomes a 21-day check-in.
--
--   - Opening the daily surprise adds a stamp, at most one a day. Days
--     don't need to be in a row, and each member starts whenever they like.
--   - 21 stamps fill the calendar, and then it's done: the daily surprise
--     carries on as usual, but there are no more stamps.
--   - Each week of 7: stamps 2, 4 and 6 give 15 Byome points, and stamp 7
--     (so stamps 7, 14 and 21) gives a prize. Until a prize's art is in,
--     that stamp gives 75 Byome points instead, and the prize follows
--     once it's added (release_calendar_item, below).
--   - Stamps already collected count towards the 21.
--
-- Handy line (SQL Editor), once a prize's art is in (I'll add the item):
--   select public.release_calendar_item('christmas-2026', 7, 'item-key');
-- (7, 14 or 21: the stamp it's for. It also goes to everyone who has
-- already reached that stamp; they keep the 75 points they got then.)
--
-- Run in the Supabase SQL Editor. Safe to run again. Paste the whole file
-- with nothing highlighted. Needs 2027-01-06-cozy-christmas.sql first. Run
-- it before publishing the site update that came with it.
-- =========================================================

-- The prize for each prize stamp (none yet: 75 points)
create table if not exists public.calendar_prizes (
  event_key text not null references public.events(key) on delete cascade,
  stamp int not null check (stamp between 1 and 21),
  item_key text references public.biome_items(key),
  primary key (event_key, stamp)
);
alter table public.calendar_prizes enable row level security;
drop policy if exists "Anyone can see calendar prizes" on public.calendar_prizes;
create policy "Anyone can see calendar prizes" on public.calendar_prizes for select using (true);

insert into public.calendar_prizes (event_key, stamp)
select 'christmas-2026', s from (values (7), (14), (21)) v(s)
where exists (select 1 from public.events where key = 'christmas-2026')
on conflict do nothing;

-- Stamps so far: numbered 1 to 21 across the whole calendar (they were
-- numbered 1 to 7 on each card)
update public.daily_gifts g set calendar_stamp = n.num, calendar_card = (n.num - 1) / 7 + 1
from (select id, row_number() over (partition by user_id, event_key order by day) as num
      from public.daily_gifts where event_key is not null) n
where g.id = n.id and g.calendar_stamp is distinct from n.num;

-- The calendar of whichever event is on: your stamps (up to 21) and the
-- prizes. Null if no event with a calendar is on.
create or replace function public.daily_calendar(p_user uuid) returns jsonb
language sql stable security definer set search_path to public as $$
  select jsonb_build_object(
    'event_key', e.key, 'name', e.name, 'ends_at', e.ends_at, 'total', 21,
    'stamps', least(n.all_stamps, 21), 'all_stamps', least(n.all_stamps, 21),
    'prizes', (select coalesce(jsonb_agg(jsonb_build_object('stamp', p.stamp, 'item',
                 (select jsonb_build_object('key', i.key, 'name', i.name, 'image', i.image, 'kind', i.kind,
                                            'size', i.size, 'rarity', i.rarity, 'over_pot', i.over_pot)
                  from biome_items i where i.key = p.item_key)) order by p.stamp), '[]'::jsonb)
               from calendar_prizes p where p.event_key = e.key))
  from events e,
       lateral (select count(*)::int as all_stamps from daily_gifts g where g.user_id = p_user and g.event_key = e.key) n
  where e.calendar and now() >= e.starts_at and now() < e.ends_at
  order by e.starts_at desc limit 1
$$;
revoke execute on function public.daily_calendar(uuid) from public, anon, authenticated;

-- Open today's packet (the same as in 2027-01-06-cozy-christmas.sql, except
-- the calendar: 21 stamps, a prize every 7th, then it's done)
create or replace function public.claim_daily_gift() returns jsonb
language plpgsql security definer set search_path to public as $$
declare
  me uuid := auth.uid();
  today date := byome_today();
  roll numeric;
  g daily_gifts%rowtype;
  ev events%rowtype;
  stamp_no int;
  prize text;
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

  -- The event calendar: stamps 1 to 21, then it's full
  select * into ev from events where calendar and now() >= starts_at and now() < ends_at order by starts_at desc limit 1;
  if found then
    stamp_no := (select count(*) from daily_gifts where user_id = me and event_key = ev.key) + 1;
    if stamp_no <= 21 then
      g.event_key := ev.key;
      g.calendar_stamp := stamp_no;
      g.calendar_card := (stamp_no - 1) / 7 + 1;
      if stamp_no % 7 in (2, 4, 6) then g.calendar_points := 15;
      elsif stamp_no % 7 = 0 then
        select item_key into prize from calendar_prizes where event_key = ev.key and calendar_prizes.stamp = stamp_no;
        if prize is not null then g.calendar_item := prize; else g.calendar_points := 75; end if;
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

-- When a calendar prize's art is ready: set it, and give it to everyone who
-- has already reached that stamp (they keep the 75 points they got then).
-- SQL Editor only.
drop function if exists public.release_calendar_item(text, text);
create or replace function public.release_calendar_item(p_event text, p_stamp int, p_item text) returns text
language plpgsql security definer set search_path to public as $$
declare
  r record;
  n int := 0;
  item_name text;
begin
  select name into item_name from biome_items where key = p_item;
  if item_name is null then return 'There''s no item "' || p_item || '" yet.'; end if;
  if p_stamp not in (7, 14, 21) then return 'Calendar prizes are for stamps 7, 14 and 21.'; end if;
  insert into calendar_prizes (event_key, stamp, item_key) values (p_event, p_stamp, p_item)
  on conflict (event_key, stamp) do update set item_key = excluded.item_key;
  for r in
    select g.id, g.user_id from daily_gifts g
    where g.event_key = p_event and g.calendar_stamp = p_stamp and g.calendar_item is null
  loop
    update daily_gifts set calendar_item = p_item where id = r.id;
    insert into biome_inventory (user_id, item_key, source) values (r.user_id, p_item, 'daily');
    perform create_notification(r.user_id, null, 'gift', null,
      'Your calendar prize for stamp ' || p_stamp || ' is here: the ' || item_name || '!', 'profile.html?shelf=edit');
    n := n + 1;
  end loop;
  return 'Done: ' || n || ' member' || case when n = 1 then '' else 's' end || ' who already reached stamp ' || p_stamp || ' got it.';
end $$;
revoke execute on function public.release_calendar_item(text, int, text) from public, anon, authenticated;

-- Tell the API about the changes straight away
notify pgrst, 'reload schema';
