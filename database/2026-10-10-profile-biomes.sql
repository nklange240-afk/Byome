-- =========================================================
-- byome: profile biomes. Each member picks the biome their profile page
-- is set in (forest, meadow, desert, snowy tundra, open ocean, coral reef),
-- and can show its symbol next to their username. Forest and meadow are
-- free for everyone; the rest are in the Biome shop.
-- Run in the Supabase SQL Editor after 2026-10-10-moderator-rewards.sql.
-- Safe to run again. Paste the whole file with nothing highlighted.
-- =========================================================


-- ---------- Biomes are a new kind of item ----------
alter table public.biome_items drop constraint if exists biome_items_kind_check;
alter table public.biome_items add constraint biome_items_kind_check
  check (kind in ('pot', 'plant', 'shelf', 'biome'));
-- Shelves and biomes have no size; pots and plants do
alter table public.biome_items drop constraint if exists biome_items_check;
alter table public.biome_items add constraint biome_items_check
  check ((kind in ('shelf', 'biome')) = (size is null));

-- The look of each biome lives in the site's code (ui.js and style.css),
-- so these have no picture yet (image is left empty).
insert into public.biome_items (key, kind, size, name, description, rarity, price, max_per_member, starter, image, sort_order) values
  ('forest', 'biome', null, 'Forest',
   'Tall trees, soft moss, and fireflies drifting through the dusk.',
   'common', null, null, true, '', 1),
  ('meadow', 'biome', null, 'Meadow',
   'Wildflowers and long grass, with seeds floating up on a warm breeze.',
   'common', null, null, true, '', 2),
  ('desert', 'biome', null, 'Desert',
   'Warm sand, wide skies and shimmering heat. Tough plants thrive here.',
   'uncommon', 300, 1, false, '', 3),
  ('tundra', 'biome', null, 'Snowy tundra',
   'Quiet, crisp and sparkling, with snow drifting down.',
   'uncommon', 300, 1, false, '', 4),
  ('ocean', 'biome', null, 'Open ocean',
   'Deep blue water, rays of light and bubbles rising to the surface.',
   'rare', 400, 1, false, '', 5),
  ('reef', 'biome', null, 'Coral reef',
   'Bright coral and glowing specks of life in warm, clear water.',
   'rare', 500, 1, false, '', 6)
on conflict (key) do nothing;


-- ---------- Each member's choice ----------
alter table public.profiles add column if not exists profile_biome text not null default 'forest'
  references public.biome_items(key);
-- Off until a member picks a biome on Edit profile (where it starts ticked)
alter table public.profiles add column if not exists show_biome_symbol boolean not null default false;


-- Choose your profile biome (you must own it, unless it's free), and
-- whether its symbol shows next to your username
create or replace function public.set_my_biome(p_key text, p_show_symbol boolean) returns void
language plpgsql security definer set search_path to public as $$
declare me uuid := auth.uid(); it biome_items%rowtype;
begin
  if me is null then raise exception 'Please log in first'; end if;
  select * into it from biome_items where key = p_key;
  if not found or it.kind <> 'biome' then raise exception 'That isn''t a biome'; end if;
  if not it.starter and not exists (select 1 from biome_inventory where user_id = me and item_key = p_key) then
    raise exception 'You don''t own that biome yet';
  end if;
  update profiles set profile_biome = p_key, show_biome_symbol = coalesce(p_show_symbol, true) where id = me;
end $$;
revoke execute on function public.set_my_biome(text, boolean) from public, anon;
grant execute on function public.set_my_biome(text, boolean) to authenticated;
