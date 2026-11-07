-- =========================================================
-- Byome: the Garden snail, the third item prize for catching falling
-- leaves (2026-12-18-falling-leaves.sql). A companion that only visits
-- large pots (the bottom shelf) and rests on the side of the pot, like the
-- ladybug does on small ones. Uncommon, only from catching leaves; one per
-- member.
-- Its chance: weight 10, next to the points prizes' 100 and the pots' 12
-- and 15, so about 1 catch in 14 gives it, until a member has it.
-- Change the chance later with, for example:
--   update drifter_prizes set weight = 15 where item_key = 'garden-snail';
-- Run in the Supabase SQL Editor. Safe to run again. Paste the whole file
-- with nothing highlighted. Needs 2026-12-18-falling-leaves.sql first.
-- =========================================================

insert into public.biome_items (key, kind, size, name, description, rarity, price, image, sort_order, max_per_member)
values ('garden-snail', 'companion', 'medium', 'Garden snail',
        'Slow, steady and very respectful: would never dream of nibbling your plants. Only visits large pots. A souvenir from autumn 2026.',
        'uncommon', null, 'biome-assets/companion-snail.png', 4, 1)
on conflict (key) do nothing;

insert into public.drifter_prizes (drifter_key, item_key, weight)
select 'falling-leaf', 'garden-snail', 10
where not exists (select 1 from public.drifter_prizes where item_key = 'garden-snail');
