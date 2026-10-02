-- =========================================================
-- byome biome, part 1: item catalogue, inventory, shop and shelf
-- Run this once in the Supabase SQL Editor (after 2026-10-02-automod.sql).
--
-- Adding a new item later = upload its image to biome-assets/ and add a row:
--   insert into biome_items (key, kind, size, name, rarity, price, image)
--   values ('mossy-pot', 'pot', 'small', 'Mossy pot', 'uncommon', 80, 'biome-assets/pot-mossy.png');
-- Limited edition: also set max_supply (e.g. 100). Not for sale (achievement
-- reward later): leave price null. Take it out of the shop: available = false.
-- Change a price:  update biome_items set price = 60 where key = 'blue-speckled';
-- =========================================================


-- ---------- Balances are private ----------
-- user_points ignored the ledger's privacy rules, so anyone could read
-- anyone's balance. Now it follows them (you see your own; mods see all).
alter view public.user_points set (security_invoker = true);


-- ---------- The catalogue ----------

create table public.biome_items (
  key text primary key check (key ~ '^[a-z0-9-]+$'),
  kind text not null check (kind in ('pot', 'plant', 'shelf')),
  size text check (size in ('small', 'medium')),       -- shelves have no size
  name text not null,
  description text,
  rarity text not null default 'common' check (rarity in ('common', 'uncommon', 'rare', 'legendary')),
  price integer check (price >= 0),                    -- biome points; null = not sold in the shop
  max_supply integer check (max_supply > 0),           -- null = unlimited
  sold integer not null default 0,
  starter boolean not null default false,              -- everyone has as many as they like, free
  image text not null,
  available boolean not null default true,             -- false = hidden from the shop
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  check ((kind = 'shelf') = (size is null))
);
alter table public.biome_items enable row level security;
create policy "Anyone can see the catalogue" on public.biome_items for select to public using (true);

insert into public.biome_items (key, kind, size, name, rarity, price, starter, image, sort_order) values
  ('terra-cotta',   'pot',   'small', 'Terra cotta pot',   'common',   null, true,  'biome-assets/pot-terra-cotta.png',   1),
  ('blue-speckled', 'pot',   'small', 'Blue speckled pot', 'common',   40,   false, 'biome-assets/pot-blue-speckled.png', 2),
  ('painted-green', 'pot',   'small', 'Painted green pot', 'uncommon', 100,  false, 'biome-assets/pot-painted-green.png', 3),
  ('default-shelf', 'shelf', null,    'Wooden shelf',      'common',   null, true,  'biome-assets/shelf-default.png',     1),
  ('painted-shelf', 'shelf', null,    'Painted shelf',     'rare',     250,  false, 'biome-assets/shelf-painted.png',     2);


-- ---------- What each member owns ----------

create table public.biome_inventory (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  item_key text not null references public.biome_items(key),
  serial integer,                                      -- "#12 of 100" for limited items
  source text not null check (source in ('shop', 'achievement', 'gift')),
  acquired_at timestamptz not null default now()
);
create index biome_inventory_user_idx on public.biome_inventory (user_id);
alter table public.biome_inventory enable row level security;
create policy "Members can see what they own" on public.biome_inventory for select to authenticated
  using (user_id = (select auth.uid()) or (select public.is_moderator()));


-- ---------- The shelf: which shelf, and what's in each spot ----------
-- Spots 0-3 top row, 4-7 middle row (small), 8-10 bottom row (medium).

alter table public.profiles add column biome_shelf text not null default 'default-shelf'
  references public.biome_items(key);

alter table public.biome_slots add column plant_key text references public.biome_items(key);
alter table public.biome_slots add constraint biome_slots_pot_key_fkey
  foreign key (pot_key) references public.biome_items(key) not valid;

-- Shop purchases are recorded in the points ledger as negative biome points
insert into public.point_rules (action, label, community_points, biome_points)
values ('biome_purchase', 'Biome shop purchase', 0, 0)
on conflict (action) do nothing;


-- ---------- Buying ----------

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
  if item.starter then raise exception 'Everyone already has that one'; end if;
  if item.max_supply is not null and item.sold >= item.max_supply then raise exception 'Sorry, that one is sold out'; end if;
  if item.kind = 'shelf' and exists (select 1 from biome_inventory where user_id = me and item_key = p_key) then
    raise exception 'You already own that shelf';
  end if;

  select coalesce(sum(biome_points), 0) into balance from point_ledger
  where user_id = me and revoked_at is null and available_at <= now();
  if balance < item.price then raise exception 'Not enough biome points yet'; end if;

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
revoke execute on function public.buy_biome_item(text) from public, anon;
grant execute on function public.buy_biome_item(text) to authenticated;


-- ---------- Arranging the shelf ----------

-- Can this member put this item in this spot? (Raises an error if not.)
create or replace function public.biome_check_placeable(p_user uuid, p_key text, p_kind text, p_size text, p_slot int)
returns void
language plpgsql security definer set search_path to public as $$
declare it biome_items%rowtype; owned int; used int;
begin
  select * into it from biome_items where key = p_key;
  if not found or it.kind <> p_kind then raise exception 'That isn''t a %', p_kind; end if;
  if it.size is distinct from p_size then raise exception 'That % doesn''t fit this spot (it''s for % spots)', p_kind, it.size; end if;
  if it.starter then return; end if;
  select count(*) into owned from biome_inventory where user_id = p_user and item_key = p_key;
  select count(*) into used from biome_slots
  where user_id = p_user and slot <> p_slot and (pot_key = p_key or plant_key = p_key);
  if used >= owned then raise exception 'You don''t have a spare % of those', p_kind; end if;
end $$;
revoke execute on function public.biome_check_placeable(uuid, text, text, text, int) from public, anon, authenticated;

-- Put a pot (and optionally a plant) in a spot. A null pot empties the spot.
create or replace function public.set_biome_slot(p_slot int, p_pot text, p_plant text default null) returns void
language plpgsql security definer set search_path to public as $$
declare
  me uuid := auth.uid();
  spot_size text := case when p_slot between 0 and 7 then 'small' when p_slot between 8 and 10 then 'medium' end;
begin
  if me is null then raise exception 'Please log in first'; end if;
  if spot_size is null then raise exception 'There''s no spot % on the shelf', p_slot; end if;

  if p_pot is null then
    if p_plant is not null then raise exception 'A plant needs a pot'; end if;
    delete from biome_slots where user_id = me and slot = p_slot;
    return;
  end if;

  perform pg_advisory_xact_lock(hashtext('biome-slot'), hashtext(me::text));
  perform biome_check_placeable(me, p_pot, 'pot', spot_size, p_slot);
  if p_plant is not null then
    perform biome_check_placeable(me, p_plant, 'plant', spot_size, p_slot);
  end if;

  insert into biome_slots (user_id, slot, pot_key, plant_key, updated_at)
  values (me, p_slot, p_pot, p_plant, now())
  on conflict (user_id, slot) do update
    set pot_key = excluded.pot_key, plant_key = excluded.plant_key, updated_at = now();
end $$;
revoke execute on function public.set_biome_slot(int, text, text) from public, anon;
grant execute on function public.set_biome_slot(int, text, text) to authenticated;

create or replace function public.set_biome_shelf(p_key text) returns void
language plpgsql security definer set search_path to public as $$
declare me uuid := auth.uid(); it biome_items%rowtype;
begin
  if me is null then raise exception 'Please log in first'; end if;
  select * into it from biome_items where key = p_key;
  if not found or it.kind <> 'shelf' then raise exception 'That isn''t a shelf'; end if;
  if not it.starter and not exists (select 1 from biome_inventory where user_id = me and item_key = p_key) then
    raise exception 'You don''t own that shelf yet';
  end if;
  update profiles set biome_shelf = p_key where id = me;
end $$;
revoke execute on function public.set_biome_shelf(text) from public, anon;
grant execute on function public.set_biome_shelf(text) to authenticated;
