-- =========================================================
-- Byome: Trick-or-treat candy, a heap of Halloween treats that sits in a
-- small pot like a plant. Uncommon, 100 Byome points, as many as you like.
-- It's only in the Byome Shop during Haunted Harvest (Oct 15 – Nov 1,
-- Central Time); anyone who buys some keeps it.
-- Run in the Supabase SQL Editor. Safe to run again. Paste the whole file
-- with nothing highlighted. Needs 2026-10-29-events-halloween.sql first.
-- =========================================================

insert into public.biome_items (key, kind, size, name, description, rarity, price, image, over_pot, sort_order, available_from, available_until)
values ('candy', 'plant', 'small', 'Trick-or-treat candy',
        'Wait a minute... that''s not a plant! A pot full of treats for anyone who stops by.',
        'uncommon', 100, 'biome-assets/plant-candy.png', false, 35, '2026-10-15 05:00:00+00', '2026-11-02 05:59:00+00')
on conflict (key) do update set
  kind = excluded.kind, size = excluded.size, name = excluded.name, description = excluded.description,
  rarity = excluded.rarity, price = excluded.price, image = excluded.image, over_pot = excluded.over_pot,
  available_from = excluded.available_from, available_until = excluded.available_until;

select key, name, price, available_from at time zone 'America/Chicago' as from_central,
       available_until at time zone 'America/Chicago' as until_central
from public.biome_items where key = 'candy';
