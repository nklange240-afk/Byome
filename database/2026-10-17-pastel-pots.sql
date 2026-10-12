-- =========================================================
-- Byome: three pastel pots for the Byome Shop, all common:
-- Buttercup (yellow), Lilac (purple) and Blush (pink).
-- Run in the Supabase SQL Editor. Safe to run again (pots already
-- added are left as they are). Paste the whole file with nothing
-- highlighted.
--
-- Change a name, price or story later with, for example:
--   update biome_items set price = 60 where key = 'buttercup';
-- =========================================================

insert into public.biome_items (key, kind, size, name, description, rarity, price, image, sort_order) values
  ('buttercup', 'pot', 'small', 'Buttercup pot',
   'A soft, buttery yellow pot that makes any shelf feel sunny.',
   'common', 40, 'biome-assets/pot-buttercup.png', 6),
  ('lilac', 'pot', 'small', 'Lilac pot',
   'A gentle lilac purple pot, calm as a spring evening.',
   'common', 40, 'biome-assets/pot-lilac.png', 7),
  ('blush', 'pot', 'small', 'Blush pot',
   'A sweet blush pink pot for a little warmth on your shelf.',
   'common', 40, 'biome-assets/pot-blush.png', 8)
on conflict (key) do nothing;
