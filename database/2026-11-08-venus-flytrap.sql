-- =========================================================
-- Byome: the Venus flytrap, the reward for "Bait the Trap" in Haunted
-- Harvest (a poll that 5 other members voted in). A small plant that hangs
-- over the rim of its pot (its own soil sits inside the pot), uncommon,
-- and only from the achievement, not the shop.
--  - Anyone who has already qualified gets it (and their points) right away.
-- Run in the Supabase SQL Editor. Safe to run again. Paste the whole file
-- with nothing highlighted. Needs 2026-10-29-events-halloween.sql first.
-- =========================================================

insert into public.biome_items (key, kind, size, name, description, rarity, price, image, over_pot, sort_order)
values ('venus-flytrap', 'plant', 'small', 'Venus flytrap',
        'It lures its visitors in, just like your poll did. For baiting the trap during Haunted Harvest 2026.',
        'uncommon', null, 'biome-assets/plant-venus-flytrap.png', true, 32)
on conflict (key) do update set
  kind = excluded.kind, size = excluded.size, name = excluded.name, description = excluded.description,
  rarity = excluded.rarity, price = excluded.price, image = excluded.image, over_pot = excluded.over_pot;

select public.release_event_reward('hh-bait-the-trap', 'venus-flytrap');
