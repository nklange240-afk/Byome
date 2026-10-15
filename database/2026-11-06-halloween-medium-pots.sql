-- =========================================================
-- Byome: large versions of the four solid Halloween pots, for the
-- bottom shelf. Common, 50 Byome points (the small ones are 40), as many
-- as you like. Like the small ones, they're only in the shop during
-- Haunted Harvest (Oct 15 – Nov 1, Central Time); anyone who buys one
-- keeps it.
-- Run in the Supabase SQL Editor. Safe to run again. Paste the whole file
-- with nothing highlighted. Needs 2026-10-31-halloween-pots.sql first.
-- =========================================================

insert into public.biome_items (key, kind, size, name, description, rarity, price, image, sort_order, available_from, available_until)
values
  ('slime-green-medium', 'pot', 'medium', 'Large slime green pot', 'A bright, slimy green for spooky season.',
   'common', 50, 'biome-assets/pot-slime-green-medium.png', 31, '2026-10-15 05:00:00+00', '2026-11-02 05:59:00+00'),
  ('witch-purple-medium', 'pot', 'medium', 'Large witch purple pot', 'A deep, bewitching purple for spooky season.',
   'common', 50, 'biome-assets/pot-witch-purple-medium.png', 32, '2026-10-15 05:00:00+00', '2026-11-02 05:59:00+00'),
  ('midnight-black-medium', 'pot', 'medium', 'Large midnight black pot', 'As dark as a moonless night.',
   'common', 50, 'biome-assets/pot-midnight-black-medium.png', 33, '2026-10-15 05:00:00+00', '2026-11-02 05:59:00+00'),
  ('harvest-orange-medium', 'pot', 'medium', 'Large harvest orange pot', 'The warm orange of the harvest season.',
   'common', 50, 'biome-assets/pot-harvest-orange-medium.png', 34, '2026-10-15 05:00:00+00', '2026-11-02 05:59:00+00')
on conflict (key) do update set
  kind = excluded.kind, size = excluded.size, name = excluded.name, description = excluded.description,
  image = excluded.image, price = excluded.price, rarity = excluded.rarity,
  available_from = excluded.available_from, available_until = excluded.available_until;

select key, name, size, price, available_from at time zone 'America/Chicago' as from_central,
       available_until at time zone 'America/Chicago' as until_central
from public.biome_items where key like '%-medium' and available_until is not null order by sort_order;
