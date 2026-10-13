-- =========================================================
-- Byome: the Black cat pot, the reward for "Beauty Horror Story" in
-- Haunted Harvest (uncommon, only from the achievement, not the shop).
--  - Anyone who has already qualified gets it (and their points) right away.
-- Run in the Supabase SQL Editor. Safe to run again. Paste the whole file
-- with nothing highlighted. Needs 2026-10-29-events-halloween.sql first.
-- =========================================================

insert into public.biome_items (key, kind, size, name, description, rarity, price, image, sort_order)
values ('black-cat-pot', 'pot', 'small', 'Black cat pot',
        'BOO! A startled black cat, for brave souls who shared a beauty horror story during Haunted Harvest 2026.',
        'uncommon', null, 'biome-assets/pot-black-cat.png', 25)
on conflict (key) do update set
  kind = excluded.kind, size = excluded.size, name = excluded.name, description = excluded.description,
  rarity = excluded.rarity, price = excluded.price, image = excluded.image;

select public.release_event_reward('hh-horror-story', 'black-cat-pot');
