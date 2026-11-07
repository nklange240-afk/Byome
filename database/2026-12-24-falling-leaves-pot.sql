-- =========================================================
-- Byome: the Falling leaves pot, the first item prize for catching falling
-- leaves (2026-12-18-falling-leaves.sql). A large pot (for the bottom
-- shelf's large plants), uncommon, and only from catching leaves, not the
-- shop; one per member.
-- Its chance: weight 8, next to the points prizes' 100, so about 1 catch in
-- 14 gives it, until a member has it (then they get points instead).
-- Change the chance later with, for example:
--   update drifter_prizes set weight = 12 where item_key = 'falling-leaves-pot';
-- Run in the Supabase SQL Editor. Safe to run again. Paste the whole file
-- with nothing highlighted. Needs 2026-12-18-falling-leaves.sql first.
-- =========================================================

insert into public.biome_items (key, kind, size, name, description, rarity, price, image, sort_order, max_per_member)
values ('falling-leaves-pot', 'pot', 'medium', 'Falling leaves pot',
        'Painted with acorns, berries and the leaves you caught drifting by. A souvenir from autumn 2026.',
        'uncommon', null, 'biome-assets/pot-autumn-leaves.png', 42, 1)
on conflict (key) do nothing;

insert into public.drifter_prizes (drifter_key, item_key, weight)
select 'falling-leaf', 'falling-leaves-pot', 8
where not exists (select 1 from public.drifter_prizes where item_key = 'falling-leaves-pot');
