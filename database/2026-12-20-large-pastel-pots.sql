-- =========================================================
-- Byome: large versions of the three pastel pots for the Byome Shop (for
-- the bottom shelf's large plants), all common, 50 Byome points:
-- Large buttercup pot, Large lilac pot and Large blush pot. The pictures
-- are the small pots' own art, scaled up like the other large pots.
-- Change a price later with, for example:
--   update biome_items set price = 60 where key = 'buttercup-medium';
-- Run in the Supabase SQL Editor. Safe to run again. Paste the whole file
-- with nothing highlighted.
-- =========================================================

insert into public.biome_items (key, kind, size, name, description, rarity, price, image, sort_order) values
  ('buttercup-medium', 'pot', 'medium', 'Large buttercup pot',
   'A soft, buttery yellow pot that makes any shelf feel sunny, with room for something bigger.',
   'common', 50, 'biome-assets/pot-buttercup-medium.png', 9),
  ('lilac-medium', 'pot', 'medium', 'Large lilac pot',
   'A gentle lilac purple pot, calm as a spring evening, with room for something bigger.',
   'common', 50, 'biome-assets/pot-lilac-medium.png', 10),
  ('blush-medium', 'pot', 'medium', 'Large blush pot',
   'A sweet blush pink pot for a little warmth on your shelf, with room for something bigger.',
   'common', 50, 'biome-assets/pot-blush-medium.png', 11)
on conflict (key) do nothing;
