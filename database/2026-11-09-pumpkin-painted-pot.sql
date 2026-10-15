-- =========================================================
-- Byome: the Pumpkin pot, the reward for "Pumpkin Spice and Everything"
-- in Haunted Harvest (a review marked as a fall favorite). A small pot,
-- uncommon, and only from the achievement, not the shop.
--  - Anyone who has already qualified gets it (and their points) right away.
-- Run in the Supabase SQL Editor. Safe to run again. Paste the whole file
-- with nothing highlighted. Needs 2026-10-29-events-halloween.sql first.
-- =========================================================

insert into public.biome_items (key, kind, size, name, description, rarity, price, image, sort_order)
values ('pumpkin-painted', 'pot', 'small', 'Pumpkin pot',
        'Painted with a grin for the season. For sharing a fall favorite during Haunted Harvest 2026.',
        'uncommon', null, 'biome-assets/pot-pumpkin-painted.png', 33)
on conflict (key) do update set
  kind = excluded.kind, size = excluded.size, name = excluded.name, description = excluded.description,
  rarity = excluded.rarity, price = excluded.price, image = excluded.image;

select public.release_event_reward('hh-pumpkin-spice', 'pumpkin-painted');
