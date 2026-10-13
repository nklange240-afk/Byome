-- =========================================================
-- Byome: limited-edition Halloween pots for the Byome Shop.
-- Slime green, Witch purple, Midnight black and Harvest orange are common
-- (40 Byome points); the striped Candy corn pot is uncommon (100). As many
-- as you like. They're only in the shop during Haunted Harvest (Oct 15 –
-- Nov 1, Central Time); anyone who buys one keeps it.
-- Run in the Supabase SQL Editor. Safe to run again. Paste the whole file
-- with nothing highlighted. Needs 2026-10-29-events-halloween.sql first.
-- =========================================================

insert into public.biome_items (key, kind, size, name, description, rarity, price, image, sort_order, available_from, available_until)
values
  ('slime-green', 'pot', 'small', 'Slime green pot', 'A bright, slimy green for spooky season.',
   'common', 40, 'biome-assets/pot-slime-green.png', 20, '2026-10-15 05:00:00+00', '2026-11-02 05:59:00+00'),
  ('witch-purple', 'pot', 'small', 'Witch purple pot', 'A deep, bewitching purple for spooky season.',
   'common', 40, 'biome-assets/pot-witch-purple.png', 21, '2026-10-15 05:00:00+00', '2026-11-02 05:59:00+00'),
  ('midnight-black', 'pot', 'small', 'Midnight black pot', 'As dark as a moonless night.',
   'common', 40, 'biome-assets/pot-midnight-black.png', 22, '2026-10-15 05:00:00+00', '2026-11-02 05:59:00+00'),
  ('harvest-orange', 'pot', 'small', 'Harvest orange pot', 'The warm orange of the harvest season.',
   'common', 40, 'biome-assets/pot-harvest-orange.png', 23, '2026-10-15 05:00:00+00', '2026-11-02 05:59:00+00'),
  ('candy-corn', 'pot', 'small', 'Candy corn pot', 'Sweet stripes of orange, yellow and cream. No sugar rush included.',
   'uncommon', 100, 'biome-assets/pot-candy-corn.png', 24, '2026-10-15 05:00:00+00', '2026-11-02 05:59:00+00')
on conflict (key) do update set
  name = excluded.name, description = excluded.description, image = excluded.image, price = excluded.price,
  rarity = excluded.rarity,
  available_from = excluded.available_from, available_until = excluded.available_until;

select key, name, price, available_from at time zone 'America/Chicago' as from_central,
       available_until at time zone 'America/Chicago' as until_central
from public.biome_items where key in ('slime-green', 'witch-purple', 'midnight-black', 'harvest-orange', 'candy-corn')
order by sort_order;
