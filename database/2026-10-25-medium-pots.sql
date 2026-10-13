-- =========================================================
-- Byome: medium pots for the bottom shelf.
--  - The Paper chain pot (the "First friend" reward) is a medium pot, so
--    it goes on the bottom shelf. If one is already on the top or middle
--    shelf, it's swapped for the small terra cotta pot there (the plant
--    and any companion stay), and it can be placed on the bottom shelf.
--  - The bottom shelf gets its free starter pot: a medium terra cotta pot,
--    free for everyone, as many as you like (like the small one).
-- Run in the Supabase SQL Editor. Safe to run again. Paste the whole file
-- with nothing highlighted.
-- =========================================================

update public.biome_items set size = 'medium' where key = 'paper-chain';

update public.biome_slots set pot_key = 'terra-cotta', updated_at = now()
where pot_key = 'paper-chain' and slot < 8;

insert into public.biome_items (key, kind, size, name, description, rarity, price, starter, image, sort_order)
values ('terra-cotta-medium', 'pot', 'medium', 'Terra cotta pot', null, 'common', null, true,
        'biome-assets/pot-terra-cotta-medium.png', 1)
on conflict (key) do update set size = excluded.size, starter = excluded.starter, image = excluded.image;

select key, name, size, starter from public.biome_items where key in ('paper-chain', 'terra-cotta-medium');
