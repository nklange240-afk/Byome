-- =========================================================
-- Byome: the Black cat pot, a limited-edition Halloween pot for the Byome
-- Shop. Small, uncommon, 100 Byome points, as many as you like. It's only
-- in the shop during Haunted Harvest (Oct 15 – Nov 1, Central Time);
-- anyone who buys one keeps it.
-- Run in the Supabase SQL Editor. Safe to run again. Paste the whole file
-- with nothing highlighted. Needs 2026-10-29-events-halloween.sql first.
-- =========================================================

insert into public.biome_items (key, kind, size, name, description, rarity, price, image, sort_order, available_from, available_until)
values ('black-cat', 'pot', 'small', 'Black cat pot', 'Nine lives, and every one of them spent napping beside a sunny window.',
        'uncommon', 100, 'biome-assets/pot-black-cat.png', 26, '2026-10-15 05:00:00+00', '2026-11-02 05:59:00+00')
on conflict (key) do update set
  kind = excluded.kind, size = excluded.size, name = excluded.name, description = excluded.description,
  image = excluded.image, price = excluded.price, rarity = excluded.rarity,
  available_from = excluded.available_from, available_until = excluded.available_until;

select key, name, price, available_from at time zone 'America/Chicago' as from_central,
       available_until at time zone 'America/Chicago' as until_central
from public.biome_items where key = 'black-cat';
