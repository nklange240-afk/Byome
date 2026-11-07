-- =========================================================
-- Byome: the Autumn blaze pot, the second item prize for catching falling
-- leaves (2026-12-18-falling-leaves.sql). A small pot (for the top and
-- middle shelves), common, and only from catching leaves, not the shop;
-- one per member.
-- Its chance: weight 15, next to the points prizes' 100 and the Falling
-- leaves pot's 12, so about 1 catch in 8 gives it, until a member has it.
-- Change the chance later with, for example:
--   update drifter_prizes set weight = 20 where item_key = 'autumn-blaze-pot';
-- Run in the Supabase SQL Editor. Safe to run again. Paste the whole file
-- with nothing highlighted. Needs 2026-12-18-falling-leaves.sql first.
-- =========================================================

insert into public.biome_items (key, kind, size, name, description, rarity, price, image, sort_order, max_per_member)
values ('autumn-blaze-pot', 'pot', 'small', 'Autumn blaze pot',
        'Glowing orange and gold, with leaves swirling all the way around. A souvenir from autumn 2026.',
        'common', null, 'biome-assets/pot-autumn-blaze.png', 43, 1)
on conflict (key) do nothing;

insert into public.drifter_prizes (drifter_key, item_key, weight)
select 'falling-leaf', 'autumn-blaze-pot', 15
where not exists (select 1 from public.drifter_prizes where item_key = 'autumn-blaze-pot');
