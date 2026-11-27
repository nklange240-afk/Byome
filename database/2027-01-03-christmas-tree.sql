-- =========================================================
-- Byome: the mini Christmas tree, a gift for every member.
--
--   - The tree comes in its own burlap wrap, so it's one item: a large
--     "pot" that can't hold a plant, drawn taller than other pots (on a
--     640 x 1024 canvas, the burlap sitting where a pot's bottom does).
--   - Decorations are themes, drawn as a layer over the tree. It comes
--     with Bare and Classic (Classic shows unless the member picks Bare);
--     more can be added later with one line each (see below).
--   - Also adds the Present pot to the shop (small and large, common).
--   - Every member gets one tree the first time they open Byome from
--     midnight Central on Friday, November 27, with a pop-up and a
--     notification. Members who join later get one too, until the gift
--     ends (January 15 for now).
--
-- Later (SQL Editor):
--   A new theme (its picture drawn over the tree on the same canvas):
--     insert into item_themes (item_key, key, name, color, image, sort_order)
--     values ('christmas-tree', 'snowflake', 'Snowflake', '#9fd3f0', 'biome-assets/tree-snowflake.png', 2);
--   Ending the gift sooner or later:
--     update item_gifts set ends_at = '2027-01-20 00:00 America/Chicago' where key = 'christmas-tree-2026';
--
-- Run in the Supabase SQL Editor BEFORE publishing the site update that
-- came with it. Safe to run again. Paste the whole file with nothing
-- highlighted.
-- =========================================================

-- ---------- Pots that come with their own plant, drawn taller ----------
alter table public.biome_items add column if not exists holds_plant boolean not null default true;
alter table public.biome_items add column if not exists tall boolean not null default false;

insert into public.biome_items (key, kind, size, name, description, rarity, price, image, sort_order, holds_plant, tall)
values ('christmas-tree', 'pot', 'medium', 'Mini Christmas tree',
        'A little pine in a burlap wrap, a gift to every member for Christmas. Choose its decorations when you arrange your shelf.',
        'uncommon', null, 'biome-assets/pot-christmas-tree.png', 40, false, true)
on conflict (key) do update set holds_plant = excluded.holds_plant, tall = excluded.tall,
  name = excluded.name, description = excluded.description, image = excluded.image;

-- ---------- Themes: decorations drawn over an item ----------
create table if not exists public.item_themes (
  item_key text not null references public.biome_items(key) on delete cascade,
  key text not null,
  name text not null,
  color text not null,                  -- the circle members tap to choose it
  image text,                           -- drawn over the item; none for "Bare"
  sort_order int not null default 0,
  is_default boolean not null default false,
  primary key (item_key, key)
);
alter table public.item_themes enable row level security;
drop policy if exists "Anyone can see item themes" on public.item_themes;
create policy "Anyone can see item themes" on public.item_themes for select using (true);

insert into public.item_themes (item_key, key, name, color, image, sort_order, is_default) values
  ('christmas-tree', 'bare', 'Bare', '#4a6b3a', null, 0, false),
  ('christmas-tree', 'classic', 'Classic', '#a3121a', 'biome-assets/tree-classic.png', 1, true)
on conflict (item_key, key) do nothing;

-- The theme chosen for the pot in each spot (none: the item's default)
alter table public.biome_slots add column if not exists theme text;

-- (the same as in 2026-11-12-small-pots-anywhere.sql, plus: a pot that
-- comes with its own plant can't hold another, and changing the pot
-- clears its theme)
create or replace function public.set_biome_slot(p_slot int, p_pot text, p_plant text default null) returns void
language plpgsql security definer set search_path to public as $$
declare
  me uuid := auth.uid();
  spot_size text := case when p_slot between 0 and 7 then 'small' when p_slot between 8 and 10 then 'medium' end;
  pot_size text;
  plant_size text;
begin
  if me is null then raise exception 'Please log in first'; end if;
  if spot_size is null then raise exception 'There''s no spot % on the shelf', p_slot; end if;

  if p_plant is not null then
    select size into plant_size from biome_items where key = p_plant and kind = 'plant';
    if not found then raise exception 'That isn''t a plant'; end if;
  end if;

  -- A plant on its own comes in the free terra cotta pot of its size
  if p_pot is null and p_plant is not null then
    select key into p_pot from biome_items
    where kind = 'pot' and starter and size = plant_size order by sort_order limit 1;
    if p_pot is null then raise exception 'There''s no pot for that plant yet'; end if;
  end if;

  if p_pot is null then
    delete from biome_slots where user_id = me and slot = p_slot;
    return;
  end if;

  perform pg_advisory_xact_lock(hashtext('biome-slot'), hashtext(me::text));
  perform biome_check_placeable(me, p_pot, 'pot', spot_size, p_slot);
  select size into pot_size from biome_items where key = p_pot;
  if p_plant is not null then
    if exists (select 1 from biome_items where key = p_pot and not holds_plant) then
      raise exception 'That one fills its spot, so there''s no room for a plant';
    end if;
    if plant_size is distinct from pot_size then
      raise exception 'That plant needs a % pot', case when plant_size = 'medium' then 'large' else 'small' end;
    end if;
    perform biome_check_placeable(me, p_plant, 'plant', pot_size, p_slot);
  end if;

  insert into biome_slots (user_id, slot, pot_key, plant_key, updated_at)
  values (me, p_slot, p_pot, p_plant, now())
  on conflict (user_id, slot) do update
    set pot_key = excluded.pot_key, plant_key = excluded.plant_key, updated_at = now(),
        theme = case when biome_slots.pot_key = excluded.pot_key then biome_slots.theme end;
end $$;
revoke execute on function public.set_biome_slot(int, text, text) from public, anon;
grant execute on function public.set_biome_slot(int, text, text) to authenticated;

-- Choose the decorations for the pot in a spot (null: its default)
create or replace function public.set_biome_theme(p_slot int, p_theme text) returns void
language plpgsql security definer set search_path to public as $$
declare
  me uuid := auth.uid();
  pot text;
begin
  if me is null then raise exception 'Please log in first'; end if;
  select pot_key into pot from biome_slots where user_id = me and slot = p_slot;
  if pot is null then raise exception 'There''s nothing in that spot'; end if;
  if p_theme is not null and not exists (select 1 from item_themes where item_key = pot and key = p_theme) then
    raise exception 'That decoration isn''t for this one';
  end if;
  update biome_slots set theme = p_theme, updated_at = now() where user_id = me and slot = p_slot;
end $$;
revoke execute on function public.set_biome_theme(int, text) from public, anon;
grant execute on function public.set_biome_theme(int, text) to authenticated;


-- ---------- Gifts for every member ----------
create table if not exists public.item_gifts (
  key text primary key,
  item_key text not null references public.biome_items(key) on delete cascade,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  message text not null
);
alter table public.item_gifts enable row level security;

create table if not exists public.item_gift_claims (
  gift_key text not null references public.item_gifts(key) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  claimed_at timestamptz not null default now(),
  primary key (gift_key, user_id)
);
alter table public.item_gift_claims enable row level security;

insert into public.item_gifts (key, item_key, starts_at, ends_at, message)
values ('christmas-tree-2026', 'christmas-tree', '2026-11-27 00:00 America/Chicago', '2027-01-15 00:00 America/Chicago',
        'Merry Christmas from Byome! A little tree for your shelf. Pick its decorations when you arrange your shelf.')
on conflict (key) do nothing;

-- Any gifts waiting for you right now: gives them, and returns them for
-- the pop-up (an empty list if there are none)
create or replace function public.claim_gifts() returns jsonb
language plpgsql security definer set search_path to public as $$
declare
  me uuid := auth.uid();
  g record;
  given jsonb := '[]'::jsonb;
begin
  if me is null then return given; end if;
  if not exists (select 1 from profiles where id = me and deleted_at is null) then return given; end if;
  for g in
    select ig.*, i.name, i.kind, i.size, i.rarity, i.image, i.description, i.tall
    from item_gifts ig join biome_items i on i.key = ig.item_key
    where now() >= ig.starts_at and now() < ig.ends_at
      and not exists (select 1 from item_gift_claims c where c.gift_key = ig.key and c.user_id = me)
  loop
    insert into item_gift_claims (gift_key, user_id) values (g.key, me) on conflict do nothing;
    continue when not found;   -- (another tab got it first)
    insert into biome_inventory (user_id, item_key, source) values (me, g.item_key, 'gift');
    insert into notifications (user_id, actor_id, type, ref_id, message, link)
    values (me, null, 'gift', null, 'A gift for you: ' || g.name || '! ' || g.message, 'profile.html?shelf=edit');
    given := given || jsonb_build_object('key', g.item_key, 'name', g.name, 'kind', g.kind, 'size', g.size,
      'rarity', g.rarity, 'image', g.image, 'description', g.description, 'tall', g.tall, 'message', g.message);
  end loop;
  return given;
end $$;
revoke execute on function public.claim_gifts() from public, anon;
grant execute on function public.claim_gifts() to authenticated;

-- ---------- The Present pot (small and large, common) ----------
insert into public.biome_items (key, kind, size, name, description, rarity, price, image, sort_order) values
  ('present', 'pot', 'small', 'Present pot',
   'A red pot wrapped up like a present, with a golden ribbon and bow.',
   'common', 40, 'biome-assets/pot-present.png', 15),
  ('present-medium', 'pot', 'medium', 'Large present pot',
   'A red pot wrapped up like a present, with a golden ribbon and bow, with room for something bigger.',
   'common', 50, 'biome-assets/pot-present-medium.png', 16)
on conflict (key) do nothing;

-- Tell the API about the new tables and functions straight away
notify pgrst, 'reload schema';
