-- =========================================================
-- Byome: the Buttercup pot, a common pot in the Byome Shop.
-- Run in the Supabase SQL Editor. Safe to run again. Paste the whole
-- file with nothing highlighted.
--
-- Change its name, price or story later with, for example:
--   update biome_items set price = 60 where key = 'buttercup';
-- =========================================================

insert into public.biome_items (key, kind, size, name, description, rarity, price, image, sort_order)
values ('buttercup', 'pot', 'small', 'Buttercup pot',
        'A soft, buttery yellow pot that makes any shelf feel sunny.',
        'common', 40, 'biome-assets/pot-buttercup.png', 6)
on conflict (key) do nothing;
