-- =========================================================
-- Byome: shop sales, starting with the Black Friday sale.
--
--   - A sale takes a percentage off everything of some kinds in the shop
--     (pots, for Black Friday) between two times. Buying charges the sale
--     price; the shop shows the old price crossed out.
--   - A doorbuster is one item at a bigger discount for one day (Central
--     time), switching at midnight.
--   - Black Friday 2026: 25% off every pot from Friday, November 27 to
--     Monday, November 30 (midnight Central), plus a 50% doorbuster each
--     day.
--
-- Changing things later (SQL Editor):
--   Today's or another day's doorbuster (for example, a new pot):
--     insert into shop_doorbusters (sale_key, day, item_key)
--     values ('black-friday-2026', '2026-11-30', 'new-pot-key')
--     on conflict (sale_key, day) do update set item_key = excluded.item_key;
--   Ending the sale early, or making it longer:
--     update shop_sales set ends_at = '2026-12-01 00:00 America/Chicago' where key = 'black-friday-2026';
--   A new sale another time:
--     insert into shop_sales (key, name, starts_at, ends_at, percent_off, kinds)
--     values ('winter-2027', 'Winter sale', '2027-01-15 00:00 America/Chicago',
--             '2027-01-18 00:00 America/Chicago', 20, '{pot,plant}');
--
-- Run in the Supabase SQL Editor BEFORE publishing the site update that
-- came with it. Safe to run again. Paste the whole file with nothing
-- highlighted.
-- =========================================================

create table if not exists public.shop_sales (
  key text primary key,
  name text not null,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  percent_off int not null check (percent_off between 1 and 90),
  kinds text[] not null default '{pot}'
);
alter table public.shop_sales enable row level security;
drop policy if exists "Anyone can see shop sales" on public.shop_sales;
create policy "Anyone can see shop sales" on public.shop_sales for select using (true);

create table if not exists public.shop_doorbusters (
  sale_key text not null references public.shop_sales(key) on delete cascade,
  day date not null,                     -- a day in Central time
  item_key text not null references public.biome_items(key) on delete cascade,
  percent_off int not null default 50 check (percent_off between 1 and 90),
  primary key (sale_key, day)
);
alter table public.shop_doorbusters enable row level security;
drop policy if exists "Anyone can see doorbusters" on public.shop_doorbusters;
create policy "Anyone can see doorbusters" on public.shop_doorbusters for select using (true);

-- Black Friday 2026 (Friday to Monday, Central time)
insert into public.shop_sales (key, name, starts_at, ends_at, percent_off, kinds)
values ('black-friday-2026', 'Black Friday sale', '2026-11-27 00:00 America/Chicago',
        '2026-12-01 00:00 America/Chicago', 25, '{pot}')
on conflict (key) do nothing;

insert into public.shop_doorbusters (sale_key, day, item_key) values
  ('black-friday-2026', '2026-11-27', 'painted-green'),
  ('black-friday-2026', '2026-11-28', 'blue-speckled-medium'),
  ('black-friday-2026', '2026-11-29', 'terry'),
  ('black-friday-2026', '2026-11-30', 'lilac-medium')
on conflict (sale_key, day) do nothing;

-- What an item costs right now: its price, the price after any sale or
-- doorbuster (the bigger discount wins), and why
create or replace function public.sale_price(p_key text) returns jsonb
language plpgsql stable security definer set search_path to public as $$
declare
  item biome_items%rowtype;
  today date := (now() at time zone 'America/Chicago')::date;
  best int := 0;
  why text;
  sale_name text;
  door boolean := false;
  r record;
begin
  select * into item from biome_items where key = p_key;
  if not found or item.price is null then return null; end if;
  for r in
    select s.name, s.percent_off as pct, false as is_door from shop_sales s
    where now() >= s.starts_at and now() < s.ends_at and item.kind = any (s.kinds)
    union all
    select s.name, d.percent_off, true from shop_doorbusters d join shop_sales s on s.key = d.sale_key
    where d.item_key = p_key and d.day = today and now() >= s.starts_at and now() < s.ends_at
  loop
    if r.pct > best then best := r.pct; sale_name := r.name; door := r.is_door; end if;
  end loop;
  return jsonb_build_object(
    'price', item.price,
    'now_price', round(item.price * (100 - best) / 100.0)::int,
    'percent_off', best,
    'sale', sale_name,
    'doorbuster', door);
end $$;
grant execute on function public.sale_price(text) to anon, authenticated;

-- For the shop page: the sale that's on (if any), today's doorbuster, and
-- the price right now of everything on sale
create or replace function public.shop_sale() returns jsonb
language sql stable security definer set search_path to public as $$
  with s as (
    select * from shop_sales where now() >= starts_at and now() < ends_at
    order by percent_off desc limit 1
  ), today as (select (now() at time zone 'America/Chicago')::date as d)
  select case when not exists (select 1 from s) then null else jsonb_build_object(
    'key', s.key, 'name', s.name, 'percent_off', s.percent_off, 'kinds', s.kinds, 'ends_at', s.ends_at,
    'doorbuster', (select jsonb_build_object('item_key', d.item_key, 'name', i.name, 'percent_off', d.percent_off,
                                             'ends_at', ((today.d + 1)::timestamp at time zone 'America/Chicago'))
                   from shop_doorbusters d join biome_items i on i.key = d.item_key, today
                   where d.sale_key = s.key and d.day = today.d),
    'prices', (select coalesce(jsonb_object_agg(i.key, sale_price(i.key)), '{}'::jsonb)
               from biome_items i
               where i.available and not i.starter and i.price is not null
                 and (sale_price(i.key)->>'percent_off')::int > 0)) end
  from s
$$;
grant execute on function public.shop_sale() to anon, authenticated;

-- Buying charges the price right now (the same as in
-- 2026-10-29-events-halloween.sql, with sale_price)
create or replace function public.buy_biome_item(p_key text) returns jsonb
language plpgsql security definer set search_path to public as $$
declare
  me uuid := auth.uid();
  item biome_items%rowtype;
  balance int;
  new_id uuid;
  new_sold int;
  cost int;
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

  cost := (sale_price(p_key)->>'now_price')::int;
  select coalesce(sum(biome_points), 0) into balance from point_ledger
  where user_id = me and revoked_at is null and biome_available_at <= now();
  if balance < cost then raise exception 'Not enough Byome points yet'; end if;

  update biome_items set sold = sold + 1 where key = p_key returning sold into new_sold;
  insert into biome_inventory (user_id, item_key, serial, source)
  values (me, p_key, case when item.max_supply is not null then new_sold end, 'shop')
  returning id into new_id;
  insert into point_ledger (user_id, action, community_points, biome_points, ref_type, ref_id)
  values (me, 'biome_purchase', 0, -cost, 'biome_item', new_id);

  return jsonb_build_object(
    'serial', case when item.max_supply is not null then new_sold end,
    'paid', cost,
    'balance', balance - cost);
end $$;

-- Tell the API about the new tables and functions straight away
notify pgrst, 'reload schema';
