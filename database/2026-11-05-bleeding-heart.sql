-- =========================================================
-- Byome: the Bleeding heart, the reward for "Fresh Blood" in Haunted
-- Harvest (3 product suggestions approved). A medium plant (for the
-- bottom shelf), rare, and only from the achievement, not the shop.
--  - Anyone who has already qualified gets it (and their points) right away.
-- Run in the Supabase SQL Editor. Safe to run again. Paste the whole file
-- with nothing highlighted. Needs 2026-10-29-events-halloween.sql first.
-- =========================================================

insert into public.biome_items (key, kind, size, name, description, rarity, price, image, sort_order)
values ('bleeding-heart', 'plant', 'medium', 'Bleeding heart',
        'Little hearts dripping from every stem. For bringing fresh blood to Byome during Haunted Harvest 2026.',
        'rare', null, 'biome-assets/plant-bleeding-heart.png', 30)
on conflict (key) do update set
  kind = excluded.kind, size = excluded.size, name = excluded.name, description = excluded.description,
  rarity = excluded.rarity, price = excluded.price, image = excluded.image;

select public.release_event_reward('hh-fresh-blood', 'bleeding-heart');
