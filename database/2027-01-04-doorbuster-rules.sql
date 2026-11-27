-- =========================================================
-- Byome: doorbusters never go to anything you can only own once.
--
--   - Items limited to one per member (like the Terry pot), shelves and
--     shelf decorations can't be a doorbuster: adding one is refused, and
--     one that's already set gets no doorbuster discount (the shop's
--     usual sale still applies).
--   - Sunday's Black Friday doorbuster was the Terry pot; it's now the
--     large Present pot.
--
-- Run in the Supabase SQL Editor. Safe to run again. Paste the whole file
-- with nothing highlighted. Needs 2027-01-02-black-friday-sale.sql and
-- 2027-01-03-christmas-tree.sql first.
-- =========================================================

-- Can you only own one of this?
create or replace function public.owned_once(p_key text) returns boolean
language sql stable security definer set search_path to public as $$
  select coalesce((select max_per_member = 1 or kind in ('shelf', 'shelf_overlay')
                   from biome_items where key = p_key), false)
$$;

-- Adding a once-only doorbuster is refused
create or replace function public.doorbuster_check() returns trigger
language plpgsql set search_path to public as $$
begin
  if owned_once(new.item_key) then
    raise exception 'The % can only be owned once, so it can''t be a doorbuster', (select name from biome_items where key = new.item_key);
  end if;
  return new;
end $$;
drop trigger if exists shop_doorbusters_check on public.shop_doorbusters;
create trigger shop_doorbusters_check before insert or update on public.shop_doorbusters
  for each row execute function public.doorbuster_check();

-- Sunday's doorbuster: the large Present pot (replacing the Terry pot,
-- or any other once-only item, but not a pot chosen since)
insert into public.shop_doorbusters (sale_key, day, item_key)
select 'black-friday-2026', '2026-11-29', 'present-medium'
where exists (select 1 from public.biome_items where key = 'present-medium')
  and exists (select 1 from public.shop_sales where key = 'black-friday-2026')
on conflict (sale_key, day) do update set item_key = excluded.item_key
  where owned_once(shop_doorbusters.item_key);

-- (the same as in 2027-01-02-black-friday-sale.sql, except that a
-- doorbuster on a once-only item doesn't count)
create or replace function public.sale_price(p_key text) returns jsonb
language plpgsql stable security definer set search_path to public as $$
declare
  item biome_items%rowtype;
  today date := (now() at time zone 'America/Chicago')::date;
  best int := 0;
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
      and not owned_once(p_key)
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

-- (the same as in 2027-01-02-black-friday-sale.sql, except that a
-- doorbuster on a once-only item isn't shown)
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
                   where d.sale_key = s.key and d.day = today.d and not owned_once(d.item_key)),
    'prices', (select coalesce(jsonb_object_agg(i.key, sale_price(i.key)), '{}'::jsonb)
               from biome_items i
               where i.available and not i.starter and i.price is not null
                 and (sale_price(i.key)->>'percent_off')::int > 0)) end
  from s
$$;
grant execute on function public.shop_sale() to anon, authenticated;

-- Tell the API about the changes straight away
notify pgrst, 'reload schema';
