-- =========================================================
-- Byome: a large Blue speckled pot for the Byome Shop (for the bottom
-- shelf's large plants), common, 50 Byome points. The picture is the small
-- pot's own art, scaled up like the other large pots.
-- Run in the Supabase SQL Editor. Safe to run again. Paste the whole file
-- with nothing highlighted.
-- =========================================================

insert into public.biome_items (key, kind, size, name, description, rarity, price, image, sort_order)
values ('blue-speckled-medium', 'pot', 'medium', 'Large blue speckled pot',
        'A cool blue pot with a speckled glaze, with room for something bigger.',
        'common', 50, 'biome-assets/pot-blue-speckled-medium.png', 12)
on conflict (key) do nothing;
