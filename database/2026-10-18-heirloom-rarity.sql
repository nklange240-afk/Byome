-- =========================================================
-- Byome: the top rarity is now called "heirloom" instead of "legendary".
-- Items already marked legendary (if any) become heirloom.
-- Run in the Supabase SQL Editor. Safe to run again. Paste the whole
-- file with nothing highlighted.
-- =========================================================

alter table public.biome_items drop constraint if exists biome_items_rarity_check;
update public.biome_items set rarity = 'heirloom' where rarity = 'legendary';
alter table public.biome_items add constraint biome_items_rarity_check
  check (rarity in ('common', 'uncommon', 'rare', 'heirloom'));
