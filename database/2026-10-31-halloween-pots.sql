-- =========================================================
-- Byome: limited-edition Halloween pots for the Byome Shop.
-- Common, 40 Byome points each, as many as you like. They're only in the
-- shop during Haunted Harvest (Oct 15 – Nov 1, Central Time); anyone who
-- buys one keeps it. (The Midnight black pot is added once its art is in.)
-- Run in the Supabase SQL Editor. Safe to run again. Paste the whole file
-- with nothing highlighted. Needs 2026-10-29-events-halloween.sql first.
-- =========================================================

insert into public.biome_items (key, kind, size, name, description, rarity, price, image, sort_order, available_from, available_until)
values
  ('slime-green', 'pot', 'small', 'Slime green pot', 'A bright, slimy green for spooky season.',
   'common', 40, 'biome-assets/pot-slime-green.png', 20, '2026-10-15 05:00:00+00', '2026-11-02 05:59:00+00'),
  ('witch-purple', 'pot', 'small', 'Witch purple pot', 'A deep, bewitching purple for spooky season.',
   'common', 40, 'biome-assets/pot-witch-purple.png', 21, '2026-10-15 05:00:00+00', '2026-11-02 05:59:00+00')
on conflict (key) do update set
  name = excluded.name, description = excluded.description, image = excluded.image, price = excluded.price,
  available_from = excluded.available_from, available_until = excluded.available_until;

select key, name, price, available_from at time zone 'America/Chicago' as from_central,
       available_until at time zone 'America/Chicago' as until_central
from public.biome_items where key in ('slime-green', 'witch-purple');
