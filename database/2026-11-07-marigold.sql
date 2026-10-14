-- =========================================================
-- Byome: the Marigolds, the reward for "Back from the Dead" in Haunted
-- Harvest (an update on a review that's at least 3 days old). A medium
-- plant (for the bottom shelf) whose leaves spill over the rim of its pot,
-- uncommon, and only from the achievement, not the shop.
--  - Anyone who has already qualified gets it (and their points) right away.
-- Run in the Supabase SQL Editor. Safe to run again. Paste the whole file
-- with nothing highlighted. Needs 2026-10-29-events-halloween.sql first.
-- =========================================================

insert into public.biome_items (key, kind, size, name, description, rarity, price, image, over_pot, sort_order)
values ('marigold', 'plant', 'medium', 'Marigolds',
        'Bright enough to guide anything back home. For bringing an old review back from the dead during Haunted Harvest 2026.',
        'uncommon', null, 'biome-assets/plant-marigold.png', true, 31)
on conflict (key) do update set
  kind = excluded.kind, size = excluded.size, name = excluded.name, description = excluded.description,
  rarity = excluded.rarity, price = excluded.price, image = excluded.image, over_pot = excluded.over_pot;

select public.release_event_reward('hh-back-from-the-dead', 'marigold');
