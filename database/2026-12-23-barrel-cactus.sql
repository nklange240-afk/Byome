-- =========================================================
-- Byome: the Barrel cactus, in the Byome Shop. A common small plant (for
-- the top and middle shelves), 60 Byome points.
-- Change its price or story later with, for example:
--   update biome_items set price = 70 where key = 'barrel-cactus';
-- Run in the Supabase SQL Editor. Safe to run again. Paste the whole file
-- with nothing highlighted.
-- =========================================================

insert into public.biome_items (key, kind, size, name, description, rarity, price, image, sort_order)
values ('barrel-cactus', 'plant', 'small', 'Barrel cactus',
        'Round, golden-spined and very much a "look, don''t touch" kind of friend. Needs sun and not much else.',
        'common', 60, 'biome-assets/plant-barrel-cactus.png', 6)
on conflict (key) do nothing;
