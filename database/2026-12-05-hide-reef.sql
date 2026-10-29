-- =========================================================
-- Byome: take the Coral reef biome out of the shop until its drawn
-- scenery is ready. Anyone who already bought it keeps it and can still
-- use it. To bring it back later:
--   update public.biome_items set available = true where key = 'reef';
-- Safe to run again. Paste the whole file with nothing highlighted.
-- =========================================================

update public.biome_items set available = false where key = 'reef';

-- Check: the reef should say false
select key, name, available from public.biome_items where kind = 'biome' order by sort_order;
