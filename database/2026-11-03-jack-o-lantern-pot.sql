-- =========================================================
-- Byome: the Jack-o'-lantern pot, the reward for "Harvest Moon" (any 5 of
-- the 7 Haunted Harvest achievements). A medium pot (for the bottom shelf),
-- heirloom, and only from the achievement, not the shop.
--  - Anyone who has already qualified gets it (and their points) right away.
-- Run in the Supabase SQL Editor. Safe to run again. Paste the whole file
-- with nothing highlighted. Needs 2026-10-29-events-halloween.sql first.
-- =========================================================

insert into public.biome_items (key, kind, size, name, description, rarity, price, image, sort_order)
values ('jack-o-lantern', 'pot', 'medium', 'Jack-o''-lantern pot',
        'Grinning from ear to ear, just like you. (Wait, do pumpkins have ears?) For completing five Haunted Harvest achievements. A souvenir from Haunted Harvest 2026.',
        'heirloom', null, 'biome-assets/pot-jack-o-lantern.png', 26)
on conflict (key) do update set
  kind = excluded.kind, size = excluded.size, name = excluded.name, description = excluded.description,
  rarity = excluded.rarity, price = excluded.price, image = excluded.image;

select public.release_event_reward('hh-harvest-moon', 'jack-o-lantern');
